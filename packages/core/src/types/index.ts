// This file exports core TypeScript types used throughout the project. 

export type ID = string | number;

export interface BaseEntity {
    id: ID;
    createdAt: Date;
    updatedAt: Date;
}

export interface User extends BaseEntity {
    username: string;
    email: string;
    passwordHash: string;
}

export interface Device extends BaseEntity {
    name: string;
    type: string;
    userId: ID;
}

export interface Log extends BaseEntity {
    message: string;
    level: 'info' | 'warn' | 'error';
    timestamp: Date;
}