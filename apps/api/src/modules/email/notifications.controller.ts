import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { type AuthenticatedUser } from "../auth/auth.types";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { NotificationService } from "./notification.service";

@Controller("notifications")
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("unread") unread?: string,
  ) {
    return this.notifications.list(user.userId, unread === "true");
  }

  @Patch(":notificationId/read")
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param("notificationId") notificationId: string,
  ) {
    return this.notifications.markRead(user.userId, notificationId);
  }
}
