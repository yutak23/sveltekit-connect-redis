import type { SessionStoreData, Store } from 'svelte-kit-sessions';
import * as upstashRedis from '@upstash/redis';
import * as upstashRedisCloudflare from '@upstash/redis/cloudflare';
import * as upstashRedisFastly from '@upstash/redis/fastly';
import * as ioredis from 'ioredis';
import * as redis from 'redis';

interface Serializer {
	parse(s: string): SessionStoreData | Promise<SessionStoreData>;
	stringify(data: SessionStoreData): string;
}

interface RedisStoreOptions {
	client:
		| upstashRedis.Redis
		| upstashRedisCloudflare.Redis
		| upstashRedisFastly.Redis
		| ioredis.Redis
		| redis.RedisClientType;
	prefix?: string;
	serializer?: Serializer;
	ttl?: number;
}

const ONE_DAY_IN_SECONDS = 86400;

export default class RedisStore implements Store {
	constructor(options: RedisStoreOptions) {
		this.client = options.client;
		this.prefix = options.prefix || '';
		this.serializer = options.serializer || JSON;
		this.ttl = options.ttl || ONE_DAY_IN_SECONDS * 1000;
	}

	client:
		| upstashRedis.Redis
		| upstashRedisCloudflare.Redis
		| upstashRedisFastly.Redis
		| ioredis.Redis
		| redis.RedisClientType;

	prefix: string;

	serializer: Serializer;

	/**
	 * Time to live in milliseconds.
	 * default: 86400 * 1000
	 */
	ttl: number;

	async get(id: string): Promise<SessionStoreData | null> {
		const key = this.prefix + id;

		if (
			this.client instanceof upstashRedis.Redis ||
			this.client instanceof upstashRedisCloudflare.Redis ||
			this.client instanceof upstashRedisFastly.Redis
		) {
			const storeData = await this.client.get<SessionStoreData | undefined>(key);
			return storeData || null;
		}

		const storeData = (await this.client.get(key)) as string;
		return storeData ? this.serializer.parse(storeData) : null;
	}

	async set(id: string, storeData: SessionStoreData, ttl: number): Promise<void> {
		const key = this.prefix + id;
		const serialized = this.serializer.stringify(storeData);

		// Infinite time does not support, so it is implemented separately.
		if (ttl !== Infinity) {
			if (
				this.client instanceof upstashRedis.Redis ||
				this.client instanceof upstashRedisCloudflare.Redis ||
				this.client instanceof upstashRedisFastly.Redis
			) {
				await this.client.set(key, serialized, { px: ttl });
				return;
			}

			if (this.client instanceof ioredis.Redis) {
				await this.client.set(key, serialized, 'PX', ttl);
				return;
			}

			await this.client.set(key, serialized, { PX: ttl });
			return;
		}

		if (
			this.client instanceof upstashRedis.Redis ||
			this.client instanceof upstashRedisCloudflare.Redis ||
			this.client instanceof upstashRedisFastly.Redis
		) {
			await this.client.set(key, serialized, { px: this.ttl });
			return;
		}

		if (this.client instanceof ioredis.Redis) {
			await this.client.set(key, serialized, 'PX', this.ttl);
			return;
		}

		await this.client.set(key, serialized, { PX: this.ttl });
	}

	async destroy(id: string): Promise<void> {
		const key = this.prefix + id;
		await this.client.del(key);
	}

	async touch(id: string, ttl: number): Promise<void> {
		const key = this.prefix + id;
		await this.client.expire(key, ttl);
	}
}
