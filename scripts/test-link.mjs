// جرب Modrinth API لـ Sodium و Iris
const slugs = ["AANobbMI", "YL57xq9U", "8oi3bvq5", "1bokaNcj"]; // sodium, iris, terralith, xaeros
for (const slug of slugs) {
  const res = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["fabric"]&game_versions=["1.21.1"]`);
  if (!res.ok) { console.log(slug, "status:", res.status); continue; }
  const versions = await res.json();
  const v = versions[0];
  if (!v) { console.log(slug, "no versions"); continue; }
  const file = v.files.find(f => f.primary) ?? v.files[0];
  console.log(`${slug}: v${v.version_number} — ${((file?.size??0)/1024/1024).toFixed(1)} MB`);
  console.log(`  URL: ${file?.url}`);
}
