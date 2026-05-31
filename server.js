const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;
const defaultDbPath = path.join(__dirname, "circleup-db.json");
const configuredDbPath = process.env.DB_PATH || defaultDbPath;

function resolveDbPath() {
  try {
    fs.mkdirSync(path.dirname(configuredDbPath), { recursive: true });
    fs.accessSync(path.dirname(configuredDbPath), fs.constants.W_OK);
    return configuredDbPath;
  } catch (error) {
    console.warn(`Database path ${configuredDbPath} is not writable. Falling back to ${defaultDbPath}.`);
    return defaultDbPath;
  }
}

const dbPath = resolveDbPath();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "circleup-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
  })
);
app.use(express.static(path.join(__dirname, "public")));

function createEmptyDb() {
  return {
    users: [],
    posts: [],
    comments: [],
    likes: [],
    follows: [],
    counters: { users: 1, posts: 1, comments: 1 }
  };
}

function readDb() {
  if (!fs.existsSync(dbPath)) return createEmptyDb();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function now() {
  return new Date().toISOString();
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function currentUser(req) {
  if (!req.session.userId) return null;
  const db = readDb();
  return publicUser(db.users.find((user) => user.id === req.session.userId));
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please sign in first." });
  }
  next();
}

function postRows(db, viewerId = 0, userId = null) {
  return db.posts
    .filter((post) => userId === null || post.user_id === userId)
    .map((post) => {
      const user = db.users.find((item) => item.id === post.user_id) || {};
      return {
        ...post,
        name: user.name,
        username: user.username,
        like_count: db.likes.filter((like) => like.post_id === post.id).length,
        comment_count: db.comments.filter((comment) => comment.post_id === post.id).length,
        liked_by_me: db.likes.some((like) => like.post_id === post.id && like.user_id === viewerId) ? 1 : 0
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function userStats(db, user, viewerId = 0) {
  return {
    ...publicUser(user),
    posts_count: db.posts.filter((post) => post.user_id === user.id).length,
    followers_count: db.follows.filter((follow) => follow.following_id === user.id).length,
    following_count: db.follows.filter((follow) => follow.follower_id === user.id).length,
    followed_by_me: db.follows.some((follow) => follow.follower_id === viewerId && follow.following_id === user.id) ? 1 : 0
  };
}

function seedDemoUser() {
  const db = readDb();
  if (db.users.length > 0) return;
  const passwordHash = bcrypt.hashSync("demo123", 10);
  const users = [
    {
      name: "Jasmini Balla",
      username: "jasmini",
      email: "jasmini@example.com",
      bio: "Building simple full-stack projects and sharing what I learn."
    },
    {
      name: "Arjun Dev",
      username: "arjun",
      email: "arjun@example.com",
      bio: "Frontend enthusiast, coffee-powered problem solver."
    },
    {
      name: "Maya Rao",
      username: "maya",
      email: "maya@example.com",
      bio: "Backend learner exploring APIs, databases, and clean UI."
    }
  ].map((user) => ({
    id: db.counters.users++,
    ...user,
    password_hash: passwordHash,
    created_at: now()
  }));
  db.users.push(...users);

  const [jasmini, arjun, maya] = users;
  const posts = [
    {
      id: db.counters.posts++,
      user_id: jasmini.id,
      content: "Welcome to CircleUp! This mini platform supports profiles, posts, comments, likes, and follows.",
      created_at: now()
    },
    {
      id: db.counters.posts++,
      user_id: arjun.id,
      content: "A good social app starts with simple interactions that feel instant and clear.",
      created_at: now()
    },
    {
      id: db.counters.posts++,
      user_id: maya.id,
      content: "Today I learned how data connects users, posts, comments, likes, and followers.",
      created_at: now()
    }
  ];
  db.posts.push(...posts);
  db.comments.push(
    { id: db.counters.comments++, post_id: posts[0].id, user_id: arjun.id, content: "Nice work! The feed feels clean.", created_at: now() },
    { id: db.counters.comments++, post_id: posts[1].id, user_id: maya.id, content: "Exactly. Small details make the app easier to use.", created_at: now() }
  );
  db.likes.push(
    { user_id: arjun.id, post_id: posts[0].id, created_at: now() },
    { user_id: maya.id, post_id: posts[0].id, created_at: now() }
  );
  db.follows.push(
    { follower_id: arjun.id, following_id: jasmini.id, created_at: now() },
    { follower_id: maya.id, following_id: jasmini.id, created_at: now() }
  );
  writeDb(db);
}

seedDemoUser();

app.get("/api/me", (req, res) => {
  res.json({ user: currentUser(req) });
});

app.post("/api/register", (req, res) => {
  const { name, username, email, password, bio = "" } = req.body;
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: "Name, username, email, and password are required." });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 3-20 letters, numbers, or underscores." });
  }

  const db = readDb();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (db.users.some((user) => user.username === normalizedUsername || user.email === normalizedEmail)) {
    return res.status(409).json({ error: "Username or email already exists." });
  }
  const user = {
    id: db.counters.users++,
    name: name.trim(),
    username: normalizedUsername,
    email: normalizedEmail,
    bio: bio.trim(),
    password_hash: bcrypt.hashSync(password, 10),
    created_at: now()
  };
  db.users.push(user);
  writeDb(db);
  req.session.userId = user.id;
  res.status(201).json({ user: publicUser(user) });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  const lookup = (username || "").trim().toLowerCase();
  const user = db.users.find((item) => item.username === lookup || item.email === lookup);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username/email or password." });
  }
  req.session.userId = user.id;
  res.json({ user: currentUser(req) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/users", (req, res) => {
  const db = readDb();
  const viewerId = req.session.userId || 0;
  const users = db.users.map((user) => userStats(db, user, viewerId)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ users });
});

app.get("/api/users/:username", (req, res) => {
  const db = readDb();
  const viewerId = req.session.userId || 0;
  const found = db.users.find((user) => user.username === req.params.username);
  const user = found ? userStats(db, found, viewerId) : null;
  if (!user) return res.status(404).json({ error: "User not found." });
  const posts = postRows(db, viewerId, user.id);
  res.json({ user, posts });
});

app.put("/api/profile", requireAuth, (req, res) => {
  const db = readDb();
  const { name, bio } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
  const user = db.users.find((item) => item.id === req.session.userId);
  user.name = name.trim();
  user.bio = (bio || "").trim();
  writeDb(db);
  res.json({ user: publicUser(user) });
});

app.post("/api/follow/:userId", requireAuth, (req, res) => {
  const db = readDb();
  const targetId = Number(req.params.userId);
  if (targetId === req.session.userId) return res.status(400).json({ error: "You cannot follow yourself." });
  const index = db.follows.findIndex((follow) => follow.follower_id === req.session.userId && follow.following_id === targetId);
  if (index >= 0) {
    db.follows.splice(index, 1);
    writeDb(db);
    return res.json({ following: false });
  }
  db.follows.push({ follower_id: req.session.userId, following_id: targetId, created_at: now() });
  writeDb(db);
  res.json({ following: true });
});

app.get("/api/posts", (req, res) => {
  const db = readDb();
  const viewerId = req.session.userId || 0;
  const posts = postRows(db, viewerId);
  res.json({ posts });
});

app.post("/api/posts", requireAuth, (req, res) => {
  const db = readDb();
  const content = (req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Post content cannot be empty." });
  db.posts.push({ id: db.counters.posts++, user_id: req.session.userId, content, created_at: now() });
  writeDb(db);
  res.status(201).json({ posts: postRows(db, req.session.userId) });
});

app.get("/api/posts/:postId/comments", (req, res) => {
  const db = readDb();
  const postId = Number(req.params.postId);
  const comments = db.comments
    .filter((comment) => comment.post_id === postId)
    .map((comment) => {
      const user = db.users.find((item) => item.id === comment.user_id) || {};
      return { ...comment, name: user.name, username: user.username };
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  res.json({ comments });
});

app.post("/api/posts/:postId/comments", requireAuth, (req, res) => {
  const db = readDb();
  const content = (req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Comment cannot be empty." });
  db.comments.push({
    id: db.counters.comments++,
    post_id: Number(req.params.postId),
    user_id: req.session.userId,
    content,
    created_at: now()
  });
  writeDb(db);
  res.status(201).json({ ok: true });
});

app.post("/api/posts/:postId/like", requireAuth, (req, res) => {
  const db = readDb();
  const postId = Number(req.params.postId);
  const index = db.likes.findIndex((like) => like.user_id === req.session.userId && like.post_id === postId);
  if (index >= 0) {
    db.likes.splice(index, 1);
    writeDb(db);
    return res.json({ liked: false });
  }
  db.likes.push({ user_id: req.session.userId, post_id: postId, created_at: now() });
  writeDb(db);
  res.json({ liked: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`CircleUp is running at http://localhost:${PORT}`);
});
