import { DynamoDB } from 'aws-sdk';

export class DynamoDBDriver {
    private client: DynamoDB;

    constructor() {
        this.client = new DynamoDB();
    }

    public async getItem(params: DynamoDB.GetItemInput): Promise<DynamoDB.GetItemOutput> {
        return this.client.getItem(params).promise();
    }

    public async putItem(params: DynamoDB.PutItemInput): Promise<DynamoDB.PutItemOutput> {
        return this.client.putItem(params).promise();
    }

    public async updateItem(params: DynamoDB.UpdateItemInput): Promise<DynamoDB.UpdateItemOutput> {
        return this.client.updateItem(params).promise();
    }

    public async deleteItem(params: DynamoDB.DeleteItemInput): Promise<DynamoDB.DeleteItemOutput> {
        return this.client.deleteItem(params).promise();
    }

    public async query(params: DynamoDB.QueryInput): Promise<DynamoDB.QueryOutput> {
        return this.client.query(params).promise();
    }

    public async scan(params: DynamoDB.ScanInput): Promise<DynamoDB.ScanOutput> {
        return this.client.scan(params).promise();
    }
}