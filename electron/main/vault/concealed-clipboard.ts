// Libs
import { execFile } from 'node:child_process';

// Electron writes text alone, and a clipboard manager only leaves out text marked concealed, so this is JXA.
const WRITE_CONCEALED = [
  "ObjC.import('AppKit');",
  'const secret = $.NSString.alloc.initWithDataEncoding(',
  '  $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile,',
  '  $.NSUTF8StringEncoding,',
  ');',
  'const board = $.NSPasteboard.generalPasteboard;',
  'board.clearContents;',
  'board.setStringForType(secret, $.NSPasteboardTypeString);',
  "board.setStringForType($(''), $('org.nspasteboard.ConcealedType'));",
].join('\n');

/** Writes a password marked concealed, on macOS; false elsewhere or if the system refused, so it is written plainly. */
export function writeConcealed(secret: string): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const child = execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', WRITE_CONCEALED],
      { timeout: 5_000 },
      (error) => resolve(error === null),
    );
    // On stdin, so the password is never in an argument list another process could read.
    child.stdin?.end(secret);
  });
}
