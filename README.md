# Exam Whiteboard

A static, client-only whiteboard and notepad intended for exams.

## Privacy / persistence model

The application intentionally does **not** use:

- localStorage
- sessionStorage
- IndexedDB
- cookies
- service workers
- analytics
- collaboration
- a backend
- a database

Whiteboard and notepad content exists only in JavaScript memory. Reloading the page or closing the tab destroys the working state.

The only persistent copy a student can create is an explicit download using the **Download Work** button.

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Upload `index.html`, `style.css`, and `app.js`.
3. Open **Settings → Pages**.
4. Select **Deploy from a branch**.
5. Select the branch containing these files and `/ (root)`.
6. Save.
7. GitHub will provide the Pages URL.

No build step is required.

## Exam-security note

Before using it in an exam, test the deployed URL in the exact browser/environment students will use. In particular, verify browser download permissions and whether the exam platform permits external websites.

The application itself contains no algorithm execution, graph search, shortest-path, traversal, or graph-solving functionality.
