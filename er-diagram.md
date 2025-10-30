# ExpenseTracker ER Diagram Specification

## For creating PNG diagram using draw.io, Lucidchart, or similar tools

### Entity Definitions with All Attributes

#### COMPANIES
```
┌─────────────────────────┐
│       COMPANIES         │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│   name: VARCHAR(255)    │
│   country: VARCHAR(100) │
│   default_currency: VARCHAR(10) │
│   created_at: TIMESTAMP │
└─────────────────────────┘
```

#### USERS
```
┌─────────────────────────┐
│         USERS           │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│ 🔗 company_id: CHAR(36) │
│   name: VARCHAR(255)    │
│   email: VARCHAR(255)   │
│   password_hash: VARCHAR(255) │
│   role: ENUM(admin/manager/employee) │
│ 🔗 manager_id: CHAR(36) │
│   created_at: TIMESTAMP │
└─────────────────────────┘
```

#### EXPENSE_CATEGORIES
```
┌─────────────────────────┐
│   EXPENSE_CATEGORIES    │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│ 🔗 company_id: CHAR(36) │
│   name: VARCHAR(100)    │
│   created_at: TIMESTAMP │
└─────────────────────────┘
```

#### EXPENSES
```
┌─────────────────────────┐
│        EXPENSES         │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│ 🔗 company_id: CHAR(36) │
│ 🔗 user_id: CHAR(36)    │
│   description: VARCHAR(255) │
│   date: DATE            │
│ 🔗 category_id: CHAR(36) │
│   paid_by: VARCHAR(100) │
│   amount: DECIMAL(12,2) │
│   currency: VARCHAR(10) │
│   remarks: TEXT         │
│   receipt_url: VARCHAR(500) │
│   status: ENUM(pending/approved/rejected) │
│   created_at: TIMESTAMP │
│   updated_at: TIMESTAMP │
└─────────────────────────┘
```

#### APPROVALS
```
┌─────────────────────────┐
│       APPROVALS         │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│ 🔗 expense_id: CHAR(36) │
│ 🔗 approver_id: CHAR(36) │
│   sequence_order: INT   │
│   status: ENUM(pending/approved/rejected/escalated) │
│   comments: TEXT        │
│   created_at: TIMESTAMP │
│   approved_at: TIMESTAMP │
└─────────────────────────┘
```

#### APPROVAL_RULES
```
┌─────────────────────────┐
│     APPROVAL_RULES      │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│ 🔗 company_id: CHAR(36) │
│   rule_name: VARCHAR(255) │
│   description: TEXT     │
│   approvers: JSON       │
│   approver_sequence: JSON │
│   rule_type: ENUM(percentage/specific/hybrid) │
│   min_approval_percentage: INT │
│   specific_approver_required: CHAR(36) │
│   created_at: TIMESTAMP │
└─────────────────────────┘
```

#### NOTIFICATIONS
```
┌─────────────────────────┐
│     NOTIFICATIONS       │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│ 🔗 user_id: CHAR(36)    │
│   title: VARCHAR(255)   │
│   message: TEXT         │
│   type: ENUM(approval/rejection/escalation/info) │
│   related_entity_id: CHAR(36) │
│   read: TINYINT(1)      │
│   created_at: TIMESTAMP │
└─────────────────────────┘
```

#### AUDIT_LOGS
```
┌─────────────────────────┐
│      AUDIT_LOGS         │
├─────────────────────────┤
│ 🔑 id: CHAR(36)         │
│ 🔗 company_id: CHAR(36) │
│ 🔗 user_id: CHAR(36)    │
│   action: VARCHAR(50)   │
│   entity_type: VARCHAR(100) │
│   entity_id: CHAR(36)   │
│   details: JSON         │
│   created_at: TIMESTAMP │
└─────────────────────────┘
```

### Relationships to Draw

1. **COMPANIES** ──1:N──► **USERS** (company_id)
2. **COMPANIES** ──1:N──► **EXPENSE_CATEGORIES** (company_id)
3. **COMPANIES** ──1:N──► **APPROVAL_RULES** (company_id)
4. **COMPANIES** ──1:N──► **AUDIT_LOGS** (company_id)
5. **USERS** ──1:N──► **EXPENSES** (user_id)
6. **USERS** ──1:N──► **APPROVALS** (approver_id)
7. **USERS** ──1:N──► **NOTIFICATIONS** (user_id)
8. **USERS** ──1:N──► **AUDIT_LOGS** (user_id)
9. **USERS** ──1:N──► **USERS** (manager_id) [Self-Reference]
10. **EXPENSES** ──1:N──► **APPROVALS** (expense_id)
11. **EXPENSE_CATEGORIES** ──1:N──► **EXPENSES** (category_id)

### Legend
- 🔑 = Primary Key
- 🔗 = Foreign Key
- 1:N = One-to-Many Relationship

### Instructions for Creating PNG:
1. Use draw.io (app.diagrams.net) or Lucidchart
2. Create rectangles for each entity with attributes listed
3. Draw lines between entities showing relationships
4. Add crow's foot notation for many side of relationships
5. Use different colors for different entity types
6. Export as PNG with high resolution (300 DPI recommended)