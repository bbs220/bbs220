// Usage:
// $env:VERCEL_TOKEN="your_vercel_token_here"
// $env:VERCEL_PROJECT_IDS="prj_yourFirstId,prj_yourSecondId"
// node clean-multiple-vercel.js
// this is for powershell

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_IDS_RAW = process.env.VERCEL_PROJECT_IDS;

if (!TOKEN || !PROJECT_IDS_RAW) {
  console.error(
    "❌ Missing VERCEL_TOKEN or VERCEL_PROJECT_IDS environment variables",
  );
  process.exit(1);
}

// split the comma-separated list into an array
const projectIds = PROJECT_IDS_RAW.split(",").map((id) => id.trim());

async function cleanProject(projectId) {
  let keptProd = false;
  let keptPreview = false;
  let until = null;
  let hasMore = true;

  console.log(`\n🚀 Scanning deployments for Project: ${projectId}`);

  while (hasMore) {
    const url = new URL("https://api.vercel.com/v6/deployments");
    url.searchParams.append("projectId", projectId);
    url.searchParams.append("limit", "100");
    if (until) url.searchParams.append("until", until);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!response.ok) {
      console.error(
        `❌ Failed to fetch deployments for ${projectId}:`,
        await response.text(),
      );
      return;
    }

    const data = await response.json();
    const deployments = data.deployments || [];

    if (deployments.length === 0) {
      hasMore = false;
      break;
    }

    for (const dep of deployments) {
      const isProd = dep.target === "production";

      // keep the very first (latest) production build we see for this project
      if (isProd && !keptProd) {
        console.log(`✅ Keeping latest PROD: ${dep.uid} (${dep.url})`);
        keptProd = true;
        continue;
      }

      // keep the very first (latest) preview build we see for this project
      if (!isProd && !keptPreview) {
        console.log(`✅ Keeping latest PREVIEW: ${dep.uid} (${dep.url})`);
        keptPreview = true;
        continue;
      }

      // delete everything else
      console.log(`🗑️  Deleting ${isProd ? "PROD" : "PREVIEW"}: ${dep.uid}`);
      const delRes = await fetch(
        `https://api.vercel.com/v13/deployments/${dep.uid}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${TOKEN}` },
        },
      );

      if (!delRes.ok) {
        console.error(`   -> ⚠️ Failed to delete ${dep.uid}`);
      }
    }

    // handle pagination
    if (data.pagination && data.pagination.next) {
      until = data.pagination.next;
    } else {
      hasMore = false;
    }
  }
  console.log(`✨ Finished cleanup for Project: ${projectId}`);
}

async function runAll() {
  for (const pid of projectIds) {
    await cleanProject(pid);
  }
  console.log("\n🎉 All projects processed successfully");
}

runAll();
