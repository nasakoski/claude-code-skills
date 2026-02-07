# Task: Story to Implementation Tasks

You are decomposing a Story into implementation tasks (1-6 tasks, 3-5h each).

## Context
{context}

## Story
{story_description}

## Acceptance Criteria
{acceptance_criteria}

## Instructions
1. Build IDEAL task plan with Foundation-First order (DB -> Repository -> Service -> API -> Frontend)
2. Each task must be independently completable using only preceding tasks
3. NO test tasks (created later by test planner)
4. NO documentation-only tasks (fold into implementation DoD)
5. Validate: Task N must NOT depend on Task N+1 or later

## Output Format (JSON)
```json
{
  "task_count": 4,
  "tasks": [
    {
      "number": 1,
      "title": "Create database schema for users",
      "goal": "Define and migrate user table with all required fields",
      "layer": "database",
      "estimate_hours": 3,
      "depends_on": []
    }
  ],
  "foundation_first_order": "DB -> Service -> API -> Frontend",
  "independence_check": "All tasks pass forward-dependency check"
}
```
