# Contributing to Open Dimention

Thanks for helping make Dimention a more useful home for ideas. Contributions of all sizes are welcome, including bug reports, documentation, accessibility improvements, interface polish, and code.

## Share an idea or report a bug

[Open an issue](https://github.com/neerajghate/open-dimention/issues) with a clear description. For bugs, include the steps to reproduce, what you expected, what happened, and your browser and Node.js versions. Use made-up example notes and remove personal content from screenshots or exports.

For larger changes, start with an issue so we can discuss the approach before you invest time in implementation.

## Make a change

1. Use **Fork** on GitHub to create your own copy, then clone your fork.
2. Install Node.js 24 or newer and run `npm ci` in the project directory.
3. Create a branch for your change and run `npm run dev` to work locally.
4. Make a focused change with a clear purpose. Update the documentation when behavior changes.
5. Run `npm test` and `npm run build`. For interface changes, also try the affected flows in the browser.
6. Commit and push your branch, then open a pull request against `neerajghate/open-dimention` on `main`.

In your pull request, explain the problem, what changed, and how you checked it. Screenshots are helpful for visible interface changes. Small first contributions are very welcome.

## Things to preserve

- Keep the 3D Space, Board, and List consistent: they show the same underlying documents.
- Respect reserved Dim space and ownership rules. Shared references should continue to point to one original document.
- Protect existing data during schema changes, preserve draft recovery, and handle failed saves visibly.
- Keep rendering responsive and test keyboard navigation and reduced-motion behavior when relevant.
- Keep local data local. Never commit `.env` files, credentials, private keys, databases, backups, or personal note exports.
- Use temporary databases and synthetic fixtures for tests. Avoid adding tests that only repeat the implementation.

See the [README](README.md) for setup, architecture, and current limitations, and [VERIFICATION.md](VERIFICATION.md) for the existing verification record.

## Stay involved

Use **Watch** on GitHub to choose the updates you want to receive, **Fork** to experiment, and issues or pull requests to join the conversation. Please keep feedback specific, constructive, and respectful.
