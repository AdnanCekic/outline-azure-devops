# Outline Azure DevOps Plugin

Rich previews of Azure DevOps work items and pull requests in [Outline](https://github.com/outline/outline).

This is an overlay repository: it contains only the plugin and builds Outline from a pinned version. See `CLAUDE.md` for architecture, development workflow and deployment.

```bash
./scripts/setup-dev.sh
cd outline && yarn tsc && yarn test plugins/azuredevops
```

## License

Apache-2.0, see `LICENSE`. Once merged into Outline, the code falls under Outline's license.
