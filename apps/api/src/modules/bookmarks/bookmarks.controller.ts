import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookmarksService } from './bookmarks.service';

@ApiTags('Bookmarks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.bookmarksService.findAll(req.user.id);
  }

  @Post()
  add(@Request() req: { user: { id: string } }, @Body('policyId') policyId: string) {
    return this.bookmarksService.add(req.user.id, policyId);
  }

  @Patch(':id')
  updateStatus(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.bookmarksService.updateStatus(req.user.id, id, status);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.bookmarksService.remove(req.user.id, id);
  }
}
