# backoff_iter crashes when the growth factor is 1.0

Calling the backoff helper with a growth factor of `1.0` and no explicit
count raises `ZeroDivisionError` from inside the library instead of either
producing a sequence or reporting a clear argument error.

A factor of `1.0` means the delay never grows, so the number of steps needed
to reach the stop value cannot be derived unless the start and stop values are
already equal.
