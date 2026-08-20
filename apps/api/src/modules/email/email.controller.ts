import { Controller, Headers, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { type Request } from "express";

import { EmailInboundService } from "./email-inbound.service";
import { configuredRateLimit } from "../../common/security/rate-limit";

type RawRequest = Request & { rawBody?: Buffer };

@Controller("email")
export class EmailController {
  constructor(private readonly inbound: EmailInboundService) {}

  @Post("inbound")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("API_RATE_LIMIT_LIMIT"),
      ttl: () => configuredRateLimit("API_RATE_LIMIT_TTL_MS"),
    },
  })
  async inboundWebhook(
    @Req() request: RawRequest,
    @Headers("x-recourse-email-signature") signature?: string,
  ) {
    return this.inbound.handleSignedWebhook(
      request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})),
      signature,
    );
  }
}
