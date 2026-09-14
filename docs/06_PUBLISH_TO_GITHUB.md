# 06 — Publish to GitHub (final step)

**Do this only after the app runs locally (`npm run dev`) and the site looks right.** Don't
publish a broken build.

Goal: get the finished code onto GitHub so it can be shared and worked on together.

## Step 1 — secrets safety (mandatory, do first)
The repo may be public, so no secrets may ever be committed.
- Ensure `.gitignore` contains at least: `.env`, `.env.local`, `.env*.local`, `node_modules`,
  `.next`.
- Confirm **only `.env.example`** (placeholder values) is tracked — never the real `.env`.
- Check no API keys are hardcoded anywhere in the source.

## Step 2 — decide WHERE to push (important)
Run `git remote get-url origin`.

### Case A — an origin already exists (this folder was CLONED from a repo)
**Push back to that same repo. Do NOT create a new one.**
```
git add -A
git commit -m "Build MVP"
git push origin main
```
If the push is **rejected for permissions**, stop and tell the human:
*"I can't push to this repo — the owner needs to add this GitHub account as a collaborator
(repo → Settings → Collaborators), then I'll retry."*

### Case B — no origin (a loose folder, not cloned)
Create a **new public repo** on the connected account:
- `gh auth status` → if not logged in, tell the human to run `gh auth login` once.
- `gh repo create <repo-name> --public --source=. --remote=origin --push`
- Fallback (no `gh`): human creates an empty public repo, pastes the URL, then
  `git remote add origin <url> && git branch -M main && git push -u origin main`.

## Step 3 — report back
Print the final repo URL clearly:
`✅ Pushed to: https://github.com/<account>/<repo-name>`
