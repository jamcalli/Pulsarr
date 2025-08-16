---
sidebar_position: 7
---

# Contributing

We welcome contributions to Pulsarr! This section outlines the process for contributing to the project.

## Fork and Branch Naming

1. **Fork the Repository**: Start by forking the Pulsarr repository to your GitHub account.

2. **Branch Naming Conventions**:
   - For new features: `features/your-feature-name`
   - For bug fixes: `bug-fix/brief-bug-description`
   - For documentation: `docs/what-you-are-documenting`
   - For performance improvements: `perf/what-you-are-improving`

## Development Workflow

1. **Create a Branch**: Create a new branch following the naming conventions above.

2. **Make Your Changes**: Implement your feature or fix the bug.

3. **Write Tests**: If applicable, write tests for your changes.

4. **Ensure Code Quality**:
   - Run linting tools: `npm run fix` (safe fixes only)
   - If CI fails with import organization errors: `npm run fix:unsafe`
   - Run TypeScript checks: `npm run typecheck`
   - Ensure tests pass (these are coming!)
   - Follow the existing code style

5. **Commit Your Changes**: Follow our commit message guidelines (see below).

6. **Push to Your Fork**: Push your changes to your forked repository.

7. **Submit a Pull Request**: Create a pull request from your branch to the develop branch of the main Pulsarr repository.

## Commit Message Guidelines

This project follows [Conventional Commits](https://www.conventionalcommits.org/) with automated linting via commitlint.

### Format

```
<type>: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat:` - New features or functionality
- `fix:` - Bug fixes or corrections  
- `refactor:` - Code refactoring without functional changes
- `docs:` - Documentation updates
- `style:` - Code style changes (formatting, etc.)
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Examples

```bash
# Feature addition
feat: add multi-instance support for content distribution

# Bug fix
fix: filter users to include only those with sync enabled

# Documentation
docs: update installation guide with PostgreSQL setup

# Refactoring
refactor: centralize notification processing logic
```

### Guidelines

- Use lowercase for type and description
- Keep description under 72 characters
- Use present tense ("add" not "added")
- Be specific and descriptive
- Reference issues when applicable: `fixes #123`

## API Development

When adding or modifying API endpoints:

1. **Update Schemas**: Ensure all request/response schemas are properly defined using Zod
2. **Add OpenAPI Tags**: Include appropriate tags and descriptions in your route definitions

The OpenAPI documentation will be automatically generated during the CI build process, so no manual generation is required.

## Pull Request Guidelines

When submitting a pull request, please:

1. **Describe Your Changes**: Provide a clear description of what the changes accomplish.

2. **Link Related Issues**: If your PR addresses an open issue, reference it using the GitHub issue linking syntax (e.g., "Fixes #123").

3. **Include Screenshots**: If your changes include visual elements, add screenshots to help reviewers understand the context.

4. **Update Documentation**: Ensure that documentation is updated to reflect your changes if necessary.

5. **Be Responsive**: Be prepared to address feedback and make requested changes.

## Questions?

If you have any questions about contributing, feel free to [open an issue](https://github.com/jamcalli/pulsarr/issues) with the label "question".

## Contributors

See all [contributors](https://github.com/jamcalli/pulsarr/graphs/contributors)