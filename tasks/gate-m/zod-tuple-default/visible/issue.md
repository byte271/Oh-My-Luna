# Tuple defaults are not applied to omitted trailing items

Parsing a tuple with a trailing defaulted item returns an array that omits the defaulted value when the input stops before that position.

Reproduce with a two-item tuple whose second string schema has the default `fallback`, then parse `['present']`. The result should preserve `present` and materialize the defaulted second item.
