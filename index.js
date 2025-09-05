import fs from 'fs';
import fetch from 'node-fetch';

const token = process.env.GITHUB_TOKEN;
const myUsername = 'likhonsexikh'; // your username
const batchSize = 5; // small, safe batch per run
const followFile = './followed.json';

// Load followed users
let followed = fs.existsSync(followFile) ? JSON.parse(fs.readFileSync(followFile)) : {};

// Helper: Fetch JSON safely
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Authorization: `token ${token}` } });
  if (!res.ok) {
    // Log the error response body for more context
    const errorBody = await res.text();
    console.error(`GitHub API error: ${res.status} ${res.statusText} for ${url}. Body: ${errorBody}`);
    throw new Error(`GitHub API error: ${res.status}`);
  }
  return res.json();
}

// Check recent activity (last 7 days)
async function isActive(username) {
  try {
    const events = await fetchJSON(`https://api.github.com/users/${username}/events/public`);
    return events.some(e => new Date(e.created_at) > new Date(Date.now() - 7 * 24 * 3600 * 1000));
  } catch (error) {
    console.error(`Could not check activity for ${username}:`, error.message);
    return false; // Assume not active if there's an error
  }
}

// Follow a user safely
async function followUser(username) {
  console.log(`Attempting to follow ${username}...`);
  try {
    const res = await fetch(`https://api.github.com/user/following/${username}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', "Content-Length": "0" },
    });
    if (res.status === 204) {
      console.log(`Successfully followed: ${username}`);
      followed[username] = { followedAt: new Date().toISOString() };
    } else {
      console.error(`Failed to follow ${username}: Status ${res.status}`);
    }
  } catch (error) {
    console.error(`Error following ${username}:`, error.message);
  }
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000)); // safe delay
}

// Unfollow users who don't follow back after 24h
async function checkUnfollow() {
  console.log('Checking for users to unfollow...');
  const now = new Date();
  for (const [user, data] of Object.entries(followed)) {
    if (!data.followedAt) continue; // Skip entries without a timestamp

    const hours = (now - new Date(data.followedAt)) / 1000 / 3600;
    if (hours > 24) {
      try {
        const res = await fetch(`https://api.github.com/users/${user}/following/${myUsername}`, {
          headers: { Authorization: `token ${token}` },
        });

        if (res.status === 404) { // 404 means they are not following you back
          console.log(`Unfollowing ${user} (no follow back after 24 hours).`);
          await fetch(`https://api.github.com/user/following/${user}`, {
            method: 'DELETE',
            headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
          });
          delete followed[user];
        } else if (res.status === 204) {
          console.log(`${user} is following back. No action needed.`);
        }
      } catch (error) {
        console.error(`Error checking follow status for ${user}:`, error.message);
      }
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }
  }
}

// Main automation
async function main() {
  console.log('Starting automation script...');

  // First, run the unfollow check
  await checkUnfollow();

  // Then, find new users to follow
  const popularAccounts = ['torvalds', 'gaearon', 'sindresorhus', 'yyx990803']; // More diverse sources
  let candidates = [];

  console.log('Fetching potential users to follow...');
  for (const account of popularAccounts) {
    try {
      const followers = await fetchJSON(`https://api.github.com/users/${account}/followers?per_page=100`);
      candidates.push(...followers.map(u => u.login));
    } catch (error) {
      console.error(`Could not fetch followers for ${account}. Skipping.`);
    }
  }

  // Remove duplicates and already followed users
  const uniqueCandidates = [...new Set(candidates)].filter(u => !followed[u] && u !== myUsername);
  console.log(`Found ${uniqueCandidates.length} new potential candidates.`);

  // Filter for active users
  const activeUsersToFollow = [];
  console.log('Filtering for active users...');
  for (const user of uniqueCandidates) {
    if (activeUsersToFollow.length >= batchSize) {
      console.log(`Reached batch size of ${batchSize}.`);
      break;
    }
    if (await isActive(user)) {
      activeUsersToFollow.push(user);
      console.log(`${user} is active. Adding to follow list.`);
    }
  }

  // Follow the selected active users
  if (activeUsersToFollow.length > 0) {
    console.log(`Following ${activeUsersToFollow.length} new active users...`);
    for (const user of activeUsersToFollow) {
      await followUser(user);
    }
  } else {
    console.log('No new active users to follow in this run.');
  }

  // Save the updated list of followed users
  try {
    fs.writeFileSync(followFile, JSON.stringify(followed, null, 2));
    console.log('Successfully saved followed users list.');
  } catch (error) {
    console.error('Error writing to followed.json:', error.message);
  }

  console.log('Automation script finished.');
}

main().catch(error => {
  console.error('An unexpected error occurred in main:', error);
});
