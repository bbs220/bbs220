// Usage:
// \$env:VERCEL_TOKEN="your_vercel_token_here"
// \$env:VERCEL_PROJECT_IDS="prj_yourFirstId,prj_yourSecondId"
// node clean-multiple-vercel.js

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_IDS_RAW = process.env.VERCEL_PROJECT_IDS;

if (!TOKEN || !PROJECT_IDS_RAW) {
  console.error("❌ Missing VERCEL_TOKEN or VERCEL_PROJECT_IDS environment variables");
  process.exit(1);
}

const projectIds = PROJECT_IDS_RAW.split(",").map((id) => id.trim());

// Helper to prevent hitting Vercel's rate limits
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cleanProject(projectId) {
  let keptProd = false;
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
      console.error(`❌ Failed to fetch deployments for ${projectId}:`, await response.text());
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

      // Protect deployments that are currently building or queued
      if (dep.state === "BUILDING" || dep.state === "QUEUED") {
        console.log(`⏳ Skipping ${isProd ? "PROD" : "PREVIEW"}: ${dep.uid} (Currently ${dep.state})`);
        continue;
      }

      // Keep the very first (latest) READY production build
      if (isProd && dep.state === "READY" && !keptProd) {
        console.log(`✅ Keeping latest READY PROD: ${dep.uid} (${dep.url})`);
        keptProd = true;
        continue;
      }

      // Delete everything else (older prods, failed prods, and ALL previews)
      console.log(`🗑️  Deleting ${isProd ? "PROD" : "PREVIEW"}: ${dep.uid} (${dep.state})`);
      
      const delRes = await fetch(`https://api.vercel.com/v13/deployments/${dep.uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      if (!delRes.ok) {
        if (delRes.status === 429) {
          console.warn(`⚠️ Rate limited by Vercel. Pausing for 5 seconds...`);
          await sleep(5000); // Wait 5 seconds before continuing
        } else {
          console.error(`   -> ⚠️ Failed to delete ${dep.uid}: ${delRes.statusText}`);
        }
      } else {
        // Small delay to be gentle on the Vercel API
        await sleep(200); 
      }
    }

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
