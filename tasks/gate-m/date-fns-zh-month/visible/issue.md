# Chinese locale month parsing mishandles October through December

Parsing Chinese dates with the `zh-CN` locale does not correctly recognize October and can classify November or December as January.

The parser should accept both numeric and Chinese month text and preserve the intended month for October, November, and December.
