# ConditionalKeys loses optional keys under TypeScript 5.4

With TypeScript 5.4, `ConditionalKeys<T, string | undefined>` does not include an optional string property that should satisfy the condition.

For a type containing a required string, an optional string-or-number, an optional string, and a record, the result should be the required-string key plus the optional-string key.
