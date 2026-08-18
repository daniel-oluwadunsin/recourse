import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model } from "mongoose";

import {
  User,
  type UserDocument,
  UserRole,
  UserStatus,
} from "./schemas/user.schema";

export interface PublicUser {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    return new this.userModel({
      email: input.email,
      passwordHash: input.passwordHash,
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
    }).save();
  }

  async findForAuthentication(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email })
      .select("+passwordHash")
      .exec() as Promise<UserDocument | null>;
  }

  async findActiveById(userId: string): Promise<UserDocument | null> {
    if (!isValidObjectId(userId)) {
      return null;
    }

    return this.userModel
      .findOne({ _id: userId, status: UserStatus.ACTIVE })
      .exec() as Promise<UserDocument | null>;
  }

  toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user._id.toString(),
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      status: user.status,
      role: user.role ?? UserRole.USER,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
