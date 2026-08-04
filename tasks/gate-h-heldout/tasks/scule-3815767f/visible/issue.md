# pascalCase and camelCase keep interior capitals

Converting an all-capitals or mixed-capitals word does not normalize the rest
of each segment.

`pascalCase("FOOBAR")` yields `FOOBAR` where `FooBar` is expected, and
`camelCase("fOOBAR")` yields `fOOBAR` where `fooBar` is expected. Only the
first character of each segment is adjusted; the remainder is passed through
unchanged.
