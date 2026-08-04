# Adding a key after a dotted table drops the separating newline

Appending a key to a document whose last element is a dotted table produces
output where the new key is concatenated onto the previous line.

Starting from a document containing `[x]` and `a.b = {}`, adding `c = 3`
renders as `a.b = {}c = 3` instead of placing `c = 3` on its own line. The
resulting text is not valid TOML.
