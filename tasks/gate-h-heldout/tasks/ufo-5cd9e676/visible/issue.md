# withoutBase can return a protocol-relative URL

Stripping a base prefix from a path can produce a result beginning with two
slashes. A value such as `//evil.com` is interpreted by browsers as a
protocol-relative URL pointing at another host, so a value that should be a
local path becomes an off-site reference.

`withoutBase("/legacy//evil.com", "/legacy")` returns `//evil.com` where a
rooted local path is expected.
