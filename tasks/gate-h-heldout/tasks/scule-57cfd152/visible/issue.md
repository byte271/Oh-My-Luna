# splitByCase splits on characters that carry no case

Splitting an identifier that contains a hyphen produces one segment per
punctuation character instead of treating the whole string as a single word.

`splitByCase("new-name-value")` is expected to yield `["new-name-value"]`
when the hyphen is not configured as a splitter, but it yields three segments.

The case-detection helper appears to treat characters that have no upper or
lower form as uppercase.
