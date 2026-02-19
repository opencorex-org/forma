// This file defines isolation levels for transactions, exporting constants or types that represent different isolation levels.

export enum IsolationLevel {
    READ_UNCOMMITTED = 'READ UNCOMMITTED',
    READ_COMMITTED = 'READ COMMITTED',
    REPEATABLE_READ = 'REPEATABLE READ',
    SERIALIZABLE = 'SERIALIZABLE',
}

// Exporting the isolation levels for use in transaction management
export const IsolationLevels = {
    READ_UNCOMMITTED,
    READ_COMMITTED,
    REPEATABLE_READ,
    SERIALIZABLE,
};