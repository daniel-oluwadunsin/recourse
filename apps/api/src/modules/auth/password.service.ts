import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";

import { type EnvironmentConfig } from "@recourse/config";

const invalidPasswordSentinel =
  "$argon2id$v=19$m=19456,p=1,t=2$c+UbX53NPykxeGtx7ovpoA$Tt/j1CW/Z50V2uRvGsFtIQ/2Lust886Q41qpareIstA";

@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: this.config.get("PASSWORD_HASH_MEMORY_COST_KIB") ?? 19456,
      parallelism: this.config.get("PASSWORD_HASH_PARALLELISM") ?? 1,
      timeCost: this.config.get("PASSWORD_HASH_TIME_COST") ?? 2,
      type: argon2.argon2id,
    });
  }

  async verify(password: string, passwordHash?: string): Promise<boolean> {
    try {
      return await argon2.verify(
        passwordHash ?? invalidPasswordSentinel,
        password,
      );
    } catch {
      return false;
    }
  }
}
