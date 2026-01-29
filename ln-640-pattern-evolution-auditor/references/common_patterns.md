# Common Architectural Patterns

Detection patterns and best practices reference for ln-640/ln-641.

## Pattern Detection (Grep)

| Pattern | Detection Keywords | File Types |
|---------|-------------------|------------|
| Job Processing | `Queue\|Worker\|Job\|Bull\|BullMQ\|Celery\|Sidekiq` | *.ts, *.js, *.py, *.rb |
| Event-Driven | `EventEmitter\|publish\|subscribe\|emit\|on\(\s*['"]` | *.ts, *.js, *.py |
| Caching | `Cache\|Redis\|Memcached\|TTL\|invalidate\|@Cacheable` | *.ts, *.js, *.py, *.java |
| Resilience | `CircuitBreaker\|Retry\|Timeout\|Fallback\|Bulkhead` | *.ts, *.js, *.py |
| CQRS | `Command\|Query\|ReadModel\|WriteModel\|CommandHandler` | *.ts, *.js, *.cs |
| Saga | `Saga\|Orchestrator\|Compensate\|SagaStep` | *.ts, *.js, *.py |
| Repository | `Repository\|findBy\|findOne\|save\|delete\|@Repository` | *.ts, *.js, *.py, *.java |
| API Gateway | `Gateway\|Proxy\|RateLimit\|ApiGateway` | *.ts, *.js, *.py |
| Event Sourcing | `EventStore\|Aggregate\|AggregateRoot\|DomainEvent` | *.ts, *.js, *.cs |
| Message Queue | `RabbitMQ\|Kafka\|SQS\|AMQP\|MessageBroker` | *.ts, *.js, *.py |

## Key Best Practices by Pattern

### Job Processing
- Dead Letter Queue (DLQ) for failed jobs
- Exponential backoff for retries
- Idempotency keys for duplicate prevention
- Job prioritization and scheduling
- Graceful shutdown handling
- Concurrency control (per worker limits)
- Job timeout configuration
- Progress tracking and logging

### Event-Driven
- Event schema versioning
- Dead letter queue for unprocessed events
- Event correlation IDs for tracing
- Idempotent event handlers
- Event ordering guarantees (when needed)
- Schema registry for validation
- Replay capability

### Caching
- Cache invalidation strategy (TTL, event-based)
- Cache-aside pattern implementation
- Cache key naming conventions
- Cache stampede prevention
- Distributed cache consistency
- Fallback to source on cache miss
- Cache warming strategies

### Resilience
- Circuit breaker with states (closed, open, half-open)
- Bulkhead isolation
- Timeout configuration per dependency
- Fallback responses
- Retry with jitter
- Health checks for dependencies
- Graceful degradation

### CQRS
- Command/Query separation
- Eventually consistent read models
- Projection update strategies
- Event-driven updates
- Read model rebuild capability
- Separate data stores (optional)

### Repository
- Unit of Work pattern
- Specification pattern for complex queries
- Transaction management
- Pagination support
- Soft delete handling
- Audit logging

## MCP Ref Search Queries

Use these queries with `ref_search_documentation`:

| Pattern | Search Query |
|---------|-------------|
| Job Processing | "job queue best practices {tech_stack} dead letter retry" |
| Event-Driven | "event driven architecture patterns {tech_stack} event sourcing" |
| Caching | "caching strategies {tech_stack} cache invalidation redis" |
| Resilience | "circuit breaker pattern {tech_stack} retry timeout" |
| CQRS | "cqrs pattern {tech_stack} command query separation" |
| Repository | "repository pattern {tech_stack} unit of work" |

## Context7 Libraries

| Pattern | Library to Query |
|---------|-----------------|
| Job Processing (Node.js) | bull, bullmq |
| Job Processing (Python) | celery |
| Event-Driven (Node.js) | eventemitter2, rxjs |
| Caching (Node.js) | ioredis, node-cache |
| Resilience (Node.js) | cockatiel, opossum |
| CQRS (.NET) | mediatr |

---
**Version:** 1.0.0
