# CircleUp Social

CircleUp Social is a mini social media platform built for the CodeAlpha Social Media Platform task. It includes user profiles, posts, comments, likes, follows, and a file-backed database.

## Features

- User registration, login, logout, and editable profiles
- Community feed with post creation
- Comments on every post
- Like and unlike system
- Follow and unfollow users
- Profile pages with user stats and posts
- Database collections for users, posts, comments, likes, and followers

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Express.js and Node.js
- Database: JSON file database persisted on the server

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Demo login:

- Username: `jasmini`
- Password: `demo123`

## Deployment

This project is ready for deployment on Render, Railway, or any Node.js hosting platform.

For Render:

1. Create a new Web Service from this GitHub repository.
2. Set the build command to `npm install`.
3. Set the start command to `npm start`.
4. Add an environment variable named `SESSION_SECRET` with any secure random value.

The app stores data in a JSON database file. For production persistence, attach a persistent disk and set `DB_PATH` to a path on that disk.
