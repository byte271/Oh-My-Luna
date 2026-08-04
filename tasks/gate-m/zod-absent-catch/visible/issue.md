# Catch fallback fails for an absent object key

An object property built from a preprocessing schema followed by `.catch([])` throws when the property is absent instead of returning the catch fallback.

Parse an empty object with a property that preprocesses a missing value into an empty array, validates an array of strings, and applies `.catch([])`. The parsed result should contain an empty array for that property.
