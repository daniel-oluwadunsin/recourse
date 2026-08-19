import { Controller, Headers, Post, Req } from "@nestjs/common";
import { type Request } from "express";

import { EmailInboundService } from "./email-inbound.service";

type RawRequest = Request & { rawBody?: Buffer };

@Controller("email")
export class EmailController {
  constructor(private readonly inbound: EmailInboundService) {}

  @Post("inbound")
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
