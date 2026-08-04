# Gate M source retrieval and validation

The task bundles do not commit upstream repository snapshots or dependency
caches. Network access is permitted for setup only; each evaluator runs without
network access after setup.

| Task | Repository | Base | Corrected | License |
|---|---|---|---|---|
| `zod-tuple-default` | `https://github.com/colinhacks/zod` | `ec979ad783a9e9c992d3c9bd4e5f3b56110b1ef8` | `b6066b3e4730fc8b966d13974b4abae8dce25df4` | MIT |
| `zod-absent-catch` | `https://github.com/colinhacks/zod` | `b8dffe9e62f17e6571e6249d05cc5102b54d94e4` | `1cab69383fcdeae2a366d5e2a2fc4d8fc765d168` | MIT |
| `date-fns-zh-month` | `https://github.com/date-fns/date-fns` | `39d1e14200cead9e4be5df88695b5e82082875ed` | `b9c5865edb7610c59e6b3694ed1e1691f4807688` | MIT |
| `type-fest-conditional-keys` | `https://github.com/sindresorhus/type-fest` | `b6d8dd60726a8d7df5a5eea3b3c9d830804d2570` | `0fb2d62f7d222d3effb0ad89d5b340e36285bcc4` | MIT OR CC0-1.0 |

Clone each repository into `.gate-m-cache/repos/<name>`, then create detached
worktrees with `git worktree add --detach <path> <commit>`. The validation script
expects the worktree names declared in
`scripts/gate-m/validate-real-tasks.mjs`.

For each Zod worktree, install the frozen workspace dependencies without
lifecycle scripts:

```sh
corepack pnpm install --ignore-scripts --frozen-lockfile
```

The date-fns evaluator uses Node's TypeScript stripping and does not install
dependencies. The type-fest evaluator requires the exact TypeScript 5.4.2
compiler. Its npm distribution identity is:

- integrity: `sha512-+2/g0Fds1ERlP6JsakQQDXjZdZMM+rqpamFZJEKh4kwTIn3iDkgKtby0CeNd5ATNZ4Ry1ax15TMx0W2V+miizQ==`
- shasum: `0ae9cebcfae970718474fe0da2c090cad6577372`

Point `OML_GATE_M_TYPESCRIPT` at its `lib/tsc.js`, then run:

```sh
OML_GATE_M_TYPESCRIPT=/absolute/path/to/typescript-5.4.2/lib/tsc.js npm run gate-m:validate
```

`git archive <commit>` must match the archive hashes in each manifest. A clean
archive contains no `.git` metadata, corrected commit identity, evaluator,
repair, packet, or review material. `tar --no-same-owner` is required when
extracting archives in shared or containerized environments.

These commands execute trusted upstream source with host authority. They are
reproducibility instructions, not a security sandbox.
