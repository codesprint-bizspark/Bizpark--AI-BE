import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { applicationDb, RegisterUserDto, LoginUserDto, JwtPayload } from 'bizpark.core';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(private jwtService: JwtService) { }

    async register(dto: RegisterUserDto) {
        const existingUser = await applicationDb.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
        if (existingUser) {
            throw new BadRequestException('Email already in use');
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);

        const user = await applicationDb.user.create({
            data: {
                email: dto.email.trim().toLowerCase(),
                name: dto.name.trim(),
                passwordHash,
            },
        });

        const payload = { sub: user.id, email: user.email, name: user.name };
        return {
            access_token: this.jwtService.sign(payload),
            user: { id: user.id, email: user.email, name: user.name }
        };
    }

    async login(dto: LoginUserDto) {
        const user = await applicationDb.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        if (user.isActive === false) {
            throw new UnauthorizedException('Account is disabled');
        }

        const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isMatch) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload = { sub: user.id, email: user.email, name: user.name };
        return {
            access_token: this.jwtService.sign(payload),
            user: { id: user.id, email: user.email, name: user.name }
        };
    }
}
