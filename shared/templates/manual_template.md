# {{PACKAGE_NAME}} v{{VERSION}} - Usage Manual

<!-- SCOPE: API/Method reference ONLY. Contains technical descriptions, parameters, return types. -->
<!-- DO NOT add: How-to instructions -> Guide, Decision rationale -> ADR -->

<!-- NO_CODE_EXAMPLES: Manuals document APIs, not implementations.
     FORBIDDEN: Code blocks, implementation snippets, code examples
     ALLOWED: Method signatures (1 line inline), parameter tables, ASCII diagrams
     INSTEAD OF CODE: Link to official documentation or real project file

     CORRECT: "See [Official docs: CreateClient()](https://docs.example.com/CreateClient)"
     CORRECT: "See [src/Services/RateLimiter.cs:42](src/Services/RateLimiter.cs#L42)"
     WRONG: Full code block with usage example -->

## Package Information

**Package:** {{PACKAGE_NAME}}
**Version:** {{VERSION}}
**Installation:** `{{INSTALL_COMMAND}}`
**Documentation:** {{OFFICIAL_DOCS_URL}}

## Overview

{{PACKAGE_DESCRIPTION}}

## Methods We Use

---

### {{METHOD_1_NAME}}

**Signature:** `{{METHOD_1_SIGNATURE}}`

**Description:** {{METHOD_1_DESCRIPTION}}

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| {{PARAM_1_NAME}} | {{PARAM_1_TYPE}} | {{PARAM_1_REQUIRED}} | {{PARAM_1_DEFAULT}} | {{PARAM_1_DESCRIPTION}} |
| {{PARAM_2_NAME}} | {{PARAM_2_TYPE}} | {{PARAM_2_REQUIRED}} | {{PARAM_2_DEFAULT}} | {{PARAM_2_DESCRIPTION}} |

**Returns:**

{{RETURN_TYPE}} - {{RETURN_DESCRIPTION}}

**Raises:**

| Exception | Condition |
|-----------|-----------|
| `{{EXCEPTION_1}}` | {{EXCEPTION_1_CONDITION}} |
| `{{EXCEPTION_2}}` | {{EXCEPTION_2_CONDITION}} |

**Documentation:** [Official docs: {{METHOD_1_NAME}}]({{METHOD_1_DOCS_URL}})

**Project usage:** See [{{PROJECT_FILE_PATH}}]({{PROJECT_FILE_PATH}}) (if exists)

{{METHOD_1_WARNINGS}}

---

### {{METHOD_2_NAME}}

**Signature:** `{{METHOD_2_SIGNATURE}}`

**Description:** {{METHOD_2_DESCRIPTION}}

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| {{PARAM_1_NAME}} | {{PARAM_1_TYPE}} | {{PARAM_1_REQUIRED}} | {{PARAM_1_DEFAULT}} | {{PARAM_1_DESCRIPTION}} |

**Returns:** {{RETURN_TYPE}} - {{RETURN_DESCRIPTION}}

**Raises:**

| Exception | Condition |
|-----------|-----------|
| `{{EXCEPTION_1}}` | {{EXCEPTION_1_CONDITION}} |

**Documentation:** [Official docs: {{METHOD_2_NAME}}]({{METHOD_2_DOCS_URL}})

---

## Configuration

<!-- TABLE-FIRST: Configuration MUST be in table format, not code -->

{{CONFIGURATION_SECTION}}

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| {{CONFIG_1_NAME}} | {{CONFIG_1_TYPE}} | {{CONFIG_1_DEFAULT}} | {{CONFIG_1_DESCRIPTION}} |
| {{CONFIG_2_NAME}} | {{CONFIG_2_TYPE}} | {{CONFIG_2_DEFAULT}} | {{CONFIG_2_DESCRIPTION}} |

## Known Limitations

{{LIMITATIONS}}

* {{LIMITATION_1}}
* {{LIMITATION_2}}

## Version-Specific Notes

{{VERSION_NOTES}}

## Related Resources

* **Official Documentation:** {{OFFICIAL_DOCS_LINK}}
* **GitHub Repository:** {{GITHUB_URL}}
* **Related Guides:** {{RELATED_GUIDES}}
* **Related ADRs:** {{RELATED_ADRS}}

**Last Updated:** {{DATE}}
