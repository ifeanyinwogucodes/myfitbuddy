import { MongoClient, Db, ServerApiVersion } from 'mongodb';
import { config } from '../config';
import { DatabaseSchemas } from './schemas';

class DatabaseConnection {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private schemas: DatabaseSchemas | null = null;

  async connect(): Promise<Db> {
    try {
      if (this.client && this.db) {
        return this.db;
      }

      if (!config.database.mongoUri) {
        throw new Error('MongoDB connection string (MONGODB_URI) is not configured');
      }

      console.log('Connecting to MongoDB...');
      // Log connection string with password hidden for debugging
      const maskedUri = config.database.mongoUri.replace(/:[^:@]+@/, ':****@');
      console.log(`Connection string: ${maskedUri}`);
      
      this.client = new MongoClient(config.database.mongoUri, config.database.options);
      
      // Test connection with a ping (like Atlas example)
      await this.client.connect();
      await this.client.db('admin').command({ ping: 1 });
      console.log('✅ Pinged MongoDB deployment successfully');
      
      // Extract database name from connection string
      const dbName = this.extractDatabaseName(config.database.mongoUri);
      this.db = this.client.db(dbName);
      
      // Initialize schemas and indexes
      this.schemas = new DatabaseSchemas(this.db);
      await this.schemas.createValidationRules();
      await this.schemas.createIndexes();
      
      console.log('✅ Successfully connected to MongoDB');
      return this.db;
    } catch (error: any) {
      console.error('❌ Failed to connect to MongoDB:', error.message || error);
      
      // Provide helpful error messages
      if (error.message?.includes('Server selection timed out')) {
        console.error('\n💡 Troubleshooting tips:');
        console.error('   1. Check your internet connection');
        console.error('   2. Verify your MongoDB Atlas IP whitelist includes your current IP');
        console.error('   3. Ensure your MongoDB connection string is correct');
        console.error('   4. Check if MongoDB Atlas cluster is running');
      } else if (error.message?.includes('authentication failed') || error.message?.includes('bad auth')) {
        console.error('\n💡 Authentication failed:');
        console.error('   1. Verify your MongoDB username and password are correct');
        console.error('   2. Check if your database user has proper permissions');
        console.error('   3. If password contains special characters, try URL encoding them');
        console.error('   4. Example: @ becomes %40, # becomes %23, etc.');
      } else if (error.message?.includes('ECONNRESET') || error.message?.includes('connection')) {
        console.error('\n💡 Connection error:');
        console.error('   1. Check your internet connection');
        console.error('   2. Verify MongoDB Atlas IP whitelist includes 0.0.0.0/0 (or your IP)');
        console.error('   3. Check if MongoDB Atlas cluster is running and accessible');
        console.error('   4. Try increasing timeout in config if connection is slow');
      } else if (!config.database.mongoUri) {
        console.error('\n💡 Missing configuration:');
        console.error('   1. Create a .env file in the project root');
        console.error('   2. Add MONGODB_URI=your_connection_string');
      }
      
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
        this.schemas = null;
        console.log('Disconnected from MongoDB');
      }
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  getSchemas(): DatabaseSchemas {
    if (!this.schemas) {
      throw new Error('Database schemas not initialized. Call connect() first.');
    }
    return this.schemas;
  }

  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }

  private extractDatabaseName(uri: string): string {
    // Extract database name from MongoDB URI
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : 'fitbuddy';
  }
}

export const database = new DatabaseConnection();