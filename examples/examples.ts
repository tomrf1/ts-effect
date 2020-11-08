import Http from './http';
import FileIO from './fileIO';
import Reuse from './reuse';
import StackSafety from './stackSafety';

Http.without();
Http.with();

FileIO.without();
FileIO.with();

Reuse.without();
Reuse.with();

StackSafety.without();
StackSafety.with();
