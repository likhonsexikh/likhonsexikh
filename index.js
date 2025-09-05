import fs from "fs";
import fetch from "node-fetch";

const token = process.env.GITHUB_TOKEN;
const batchSize = 25;
const filePath = "./followed.json";

// Load previously followed users
let followed = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath)) : [];

// Helper: Fetch JSON from GitHub API
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Authorization: `token ${token}` } });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

// Fetch followers of an account
async function getFollowers(username, perPage = 100, page = 1) {
  const data = await fetchJSON(`https://api.github.com/users/${username}/followers?per_page=${perPage}&page=${page}`);
  return data.map(u => u.login).filter(u => !followed.includes(u));
}

// Fetch contributors of a repo
async function getContributors(owner, repo) {
  const data = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/contributors`);
  return data.map(u => u.login).filter(u => !followed.includes(u));
}

// Fetch stargazers of a repo
async function getStargazers(owner, repo) {
  const data = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/stargazers`);
  return data.map(u => u.login).filter(u => !followed.includes(u));
}

// Follow a user
async function followUser(username) {
  const res = await fetch(`https://api.github.com/user/following/${username}`, {
    method: "PUT",
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" }
  });
  if (res.status === 204) {
    console.log(`Followed: ${username}`);
    followed.push(username);
  } else {
    console.error(`Failed to follow ${username}: ${res.status}`);
  }
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
}

// Main automation
async function main() {
  // Auto-generate users to follow
  let users = [];
  users.push(...await getFollowers("torvalds")); // example popular user
  users.push(...await getContributors("facebook", "react"));
  users.push(...await getStargazers("vercel", "next.js"));

  // Deduplicate
  users = [...new Set(users)];

  // Limit batch
  const toFollow = users.slice(0, batchSize);

  for (const user of toFollow) {
    await followUser(user);
  }

  // Save followed list
  fs.writeFileSync(filePath, JSON.stringify(followed, null, 2));
}

main().catch(console.error);
