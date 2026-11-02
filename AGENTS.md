# Project workflow

The user wants the latest completed work online in Netlify.

- After each substantial change or completed task, run the relevant checks,
  commit the completed change and push `main` to trigger the connected Netlify
  production deployment. This deployment workflow is already authorized.
- Verify the deployment result and compare `/version.json` on the live site
  with the pushed commit. A successful Git push is not proof of publication.
- If a build fails, diagnose the logs, fix the cause and deploy again. If access
  prevents verification, report that specific blocker; never claim success.
- Production site: https://visionary-kitsune-62a295.netlify.app/
- Keep GPS measurements, timetable estimates and demo data clearly distinct.
- Use the existing checkout; cloud tasks are isolated. Do not create worktrees
  unless the user explicitly asks for one.
