# [PRD] <Product initiative>

> Canonical, spec-aware PRD for Harness OS. **Part A** is the product framing (condensed
> from the original `PRD_Template.md`, which remains as the verbose reference). **Part B**
> is the SDD-ready layer — it compiles directly into a machine-readable spec via
> `create_spec`, and its acceptance criteria seed the RED test gate. A traditional PRD
> describes *what features exist*; an SDD-ready PRD also pins *what the system must NOT
> do* and *which state transitions are valid*, so a probabilistic agent can't drift.

## Part A — Product framing

- **Problem / opportunity:** the core customer problem, with evidence.
- **Why now:** timing, cost of delay.
- **Target users:** primary, secondary, explicitly-not-for.
- **Definition of success:** 3–5 outcome metrics (not vanity, not output counts).
- **UX / design principles:** 3–5 directive principles.
- **Scope TL;DR:** one paragraph — what's in, what's intentionally out.
- **Constraints & assumptions / open questions & risks.**

## Part B — SDD-ready spec layer

> These four sections map 1:1 onto the spec schema (`templates/spec.*.yaml`). Fill them
> and run `create_spec` (kind = product|domain|api|data|infra).

### B1. Context & scope boundaries
Precisely what is in and out of scope; declared external dependencies, APIs, and shared
schemas — to prevent AI context drift.
- `in_scope:` …
- `out_of_scope:` …
- `external_dependencies:` …
- `shared_schemas:` …

### B2. Deterministic state machines
Map the system as a finite state machine. Tabulate every valid state, event, and
transition; **explicitly forbid** invalid transitions (block unauthorized paths).
- `states:` …  `initial:` …
- `transitions:` `{ from, event, to }` …
- `forbidden:` `{ from, to, reason }` …

### B3. Negative constraints (guardrails)
The "Thou Shalt Not" laws. What the system MUST NOT do — restrict optimizations,
security-filter bypass, and unapproved features. Each gets an id + severity.
- `{ id, message, severity: low|medium|high|critical }` …

### B4. Executable acceptance criteria
Written as assertions, ready to parse into the automated RED test gate.
- `{ id, given, when, then, invariant }` …

---

**Order is always: Constitution → Spec → Tests → Code.** Code is the disposable,
regenerable byproduct. If requirements change, rewrite the spec and regenerate.
