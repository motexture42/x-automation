#!/usr/bin/env node
import { Command } from 'commander';
import { authCommand } from './commands/auth';
import { timelineCommand } from './commands/timeline';
import { postCommand } from './commands/post';
import { replyCommand } from './commands/reply';
import { searchCommand } from './commands/search';
import { commentsCommand } from './commands/comments';
import { analyticsCommand } from './commands/analytics';
import { likeCommand } from './commands/like';
import { retweetCommand } from './commands/retweet';
import { interactCommand } from './commands/interact';
import { followCommand } from './commands/follow';
import { debugCommand } from './commands/debug';

const program = new Command();

program
  .name('x-cli')
  .description('Agentic AI-friendly X CLI using browser automation')
  .version('1.0.0');

program.addCommand(authCommand);
program.addCommand(timelineCommand);
program.addCommand(postCommand);
program.addCommand(replyCommand);
program.addCommand(searchCommand);
program.addCommand(commentsCommand);
program.addCommand(analyticsCommand);
program.addCommand(likeCommand);
program.addCommand(retweetCommand);
program.addCommand(interactCommand);
program.addCommand(followCommand);
program.addCommand(debugCommand);

program.parse(process.argv);
