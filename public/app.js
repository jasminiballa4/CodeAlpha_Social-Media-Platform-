const state = {
  user: null,
  posts: [],
  people: [],
  activeView: "feed"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function initials(name = "C") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(`${value}Z`));
}

function setStatus(message, isError = false) {
  const status = $("#statusText");
  status.textContent = message;
  status.className = isError ? "error" : "";
  if (message) setTimeout(() => (status.textContent = ""), 3500);
}

function showView(view) {
  state.activeView = view;
  $$(".view").forEach((section) => section.classList.add("hidden"));
  $(`#${view}View`).classList.remove("hidden");
  $$(".nav-actions button[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "people") loadPeople();
  if (view === "profile") renderProfile(state.user?.username);
}

function renderSession() {
  const signedIn = Boolean(state.user);
  $("#authPanel").classList.toggle("hidden", signedIn);
  $("#sessionPanel").classList.toggle("hidden", !signedIn);
  $("#logoutBtn").classList.toggle("hidden", !signedIn);
  $(".composer").classList.toggle("disabled", !signedIn);

  if (!signedIn) return;
  $("#meAvatar").textContent = initials(state.user.name);
  $("#meName").textContent = state.user.name;
  $("#meBio").textContent = state.user.bio || `@${state.user.username}`;
  $("#profileForm").name.value = state.user.name;
  $("#profileForm").bio.value = state.user.bio || "";
}

function renderPosts(posts, target = $("#postsList")) {
  const template = $("#postTemplate");
  target.innerHTML = "";
  if (!posts.length) {
    target.innerHTML = `<div class="empty-state">No posts yet. Start the conversation.</div>`;
    return;
  }

  posts.forEach((post) => {
    const node = template.content.cloneNode(true);
    const card = $(".post-card", node);
    card.dataset.postId = post.id;
    $(".mini-avatar", node).textContent = initials(post.name);
    $(".mini-avatar", node).addEventListener("click", () => renderProfile(post.username));
    $(".author-name", node).textContent = `${post.name} @${post.username}`;
    $(".author-name", node).addEventListener("click", () => renderProfile(post.username));
    $(".post-time", node).textContent = formatTime(post.created_at);
    $(".post-content", node).textContent = post.content;

    const likeBtn = $(".like-btn", node);
    likeBtn.textContent = `${post.liked_by_me ? "Unlike" : "Like"} (${post.like_count})`;
    likeBtn.classList.toggle("liked", Boolean(post.liked_by_me));
    likeBtn.addEventListener("click", () => toggleLike(post.id));

    const commentToggle = $(".comment-toggle", node);
    commentToggle.textContent = `Comments (${post.comment_count})`;
    commentToggle.addEventListener("click", () => toggleComments(card, post.id));

    $(".comment-form", node).addEventListener("submit", (event) => submitComment(event, post.id, card));
    target.appendChild(node);
  });
}

async function toggleComments(card, postId) {
  const panel = $(".comments", card);
  panel.classList.toggle("hidden");
  if (panel.classList.contains("hidden")) return;
  const { comments } = await api(`/api/posts/${postId}/comments`);
  $(".comments-list", card).innerHTML = comments
    .map((comment) => `
      <div class="comment">
        <strong>${comment.name}</strong>
        <span>${comment.content}</span>
      </div>
    `)
    .join("") || `<p class="muted">No comments yet.</p>`;
}

async function submitComment(event, postId, card) {
  event.preventDefault();
  if (!state.user) return setStatus("Sign in to comment.", true);
  const form = event.currentTarget;
  const content = form.content.value.trim();
  if (!content) return;
  await api(`/api/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
  form.reset();
  await loadPosts();
  const updatedCard = $(`.post-card[data-post-id="${postId}"]`);
  if (updatedCard) await toggleComments(updatedCard, postId);
}

async function toggleLike(postId) {
  if (!state.user) return setStatus("Sign in to like posts.", true);
  await api(`/api/posts/${postId}/like`, { method: "POST" });
  await loadPosts();
}

async function loadPosts() {
  const { posts } = await api("/api/posts");
  state.posts = posts;
  renderPosts(posts);
}

async function loadPeople() {
  const { users } = await api("/api/users");
  state.people = users;
  $("#peopleList").innerHTML = users
    .map((user) => `
      <article class="person-card">
        <button class="avatar" data-profile="${user.username}">${initials(user.name)}</button>
        <h3>${user.name}</h3>
        <p class="muted">@${user.username}</p>
        <p>${user.bio || "CircleUp member"}</p>
        <div class="stats">
          <span>${user.posts_count} posts</span>
          <span>${user.followers_count} followers</span>
        </div>
        ${
          state.user && state.user.id !== user.id
            ? `<button class="follow-btn" data-user-id="${user.id}">${user.followed_by_me ? "Following" : "Follow"}</button>`
            : ""
        }
      </article>
    `)
    .join("");

  $$("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => renderProfile(button.dataset.profile));
  });
  $$(".follow-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/follow/${button.dataset.userId}`, { method: "POST" });
      await loadPeople();
    });
  });
}

async function renderProfile(username) {
  if (!username) return showView("feed");
  const { user, posts } = await api(`/api/users/${username}`);
  $("#profileDetail").innerHTML = `
    <section class="profile-hero">
      <div class="avatar large">${initials(user.name)}</div>
      <div>
        <p class="muted">@${user.username}</p>
        <h2>${user.name}</h2>
        <p>${user.bio || "No bio yet."}</p>
        <div class="stats">
          <span>${user.posts_count} posts</span>
          <span>${user.followers_count} followers</span>
          <span>${user.following_count} following</span>
        </div>
        ${
          state.user && state.user.id !== user.id
            ? `<button class="follow-btn" data-user-id="${user.id}">${user.followed_by_me ? "Following" : "Follow"}</button>`
            : ""
        }
      </div>
    </section>
    <div class="section-title compact"><h2>${user.name}'s Posts</h2></div>
    <div id="profilePosts" class="posts"></div>
  `;
  showView("profile");
  renderPosts(posts, $("#profilePosts"));
  const followBtn = $(".follow-btn", $("#profileDetail"));
  if (followBtn) {
    followBtn.addEventListener("click", async () => {
      await api(`/api/follow/${followBtn.dataset.userId}`, { method: "POST" });
      await renderProfile(username);
    });
  }
}

async function refreshSession() {
  const { user } = await api("/api/me");
  state.user = user;
  renderSession();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const { user } = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value
      })
    });
    state.user = user;
    renderSession();
    await loadPosts();
    setStatus("Signed in successfully.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const { user } = await api("/api/register", {
      method: "POST",
      body: JSON.stringify(values)
    });
    state.user = user;
    renderSession();
    await loadPosts();
    setStatus("Account created.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  renderSession();
  await loadPosts();
});

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const { user } = await api("/api/profile", {
    method: "PUT",
    body: JSON.stringify(values)
  });
  state.user = user;
  renderSession();
  setStatus("Profile updated.");
});

$("#postForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user) return setStatus("Sign in to create a post.", true);
  const form = event.currentTarget;
  const content = form.content.value.trim();
  if (!content) return;
  await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({ content })
  });
  form.reset();
  await loadPosts();
  showView("feed");
});

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

refreshSession().then(loadPosts);
