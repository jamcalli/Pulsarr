# Commit Message

```
test: add comprehensive unit tests for utility functions

- Add test infrastructure with Vitest configuration and global setup/teardown
- Implement IP address validation tests covering IPv4/IPv6, private ranges, and invalid inputs
- Create authentication bypass tests for local IP detection and auth modes
- Add date serialization tests for ISO string handling and show date formatting
- Implement GUID handler tests for parsing, matching, and ID extraction
- Create route error tests for logging, service errors, and response handling
- Add rule builder tests for conditions, genres, years, users, and logical groupings
- Implement URL utility tests for normalization, endpoint comparison, and backoff delays
- Configure Vitest with coverage reporting, path aliases, and global setup
- Add test helper with database management and Fastify app builder
- Update .gitignore to exclude coverage reports and test database files
- Update biome.json to exclude test artifacts from linting
- Add test step to CI workflow for automated testing on push/PR

Total: 195 passing tests across 8 test files
```
