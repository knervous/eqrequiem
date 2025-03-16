import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { PermissionStatusTypes } from 'sage-core/hooks/permissions';
import './status-dialog.css';

export const StatusDialog = ({
  open,
  permissionStatus,
  requestPermissions,
  onDrop,
  fsHandle,
  onFolderSelected
}) => {

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      open={open}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDrop}
      onClose={() => {}}
      aria-labelledby="draggable-dialog-title"
    >
      <DialogTitle
        style={{ cursor: 'move', margin: '0 auto' }}
        id="draggable-dialog-title"
      >
        Entering EQ Requiem
      </DialogTitle>
      <DialogContent>
        <div>
          <Stack
            alignContent="center"
            justifyContent="space-between"
            direction="row"
            spacing={1}
          ></Stack>
          {permissionStatus === PermissionStatusTypes.ApiUnavailable && (
            <Typography
              sx={{ fontSize: 17, marginBottom: 2 }}
              color="text.secondary"
              gutterBottom
            >
              Unfortunately, your browser does not support the required
              permissions to the File System. Visit{' '}
              <Link
                target="_blank"
                href="https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission"
              >
                this link
              </Link>{' '}
              to learn more about which browsers are supported. Additionally, if
              you are using Spire and viewing this site over http and not https,
              you will need to instead visit the{' '}
              <Link href="https://eqsage.vercel.app">standalone Sage site</Link>{' '}
              and enter your remote host from the settings dialog to connect to
              sage.
            </Typography>
          )}
          {permissionStatus === PermissionStatusTypes.NeedRefresh && (
            <Stack alignContent={'center'}>
              <Typography
                sx={{ fontSize: 18, marginBottom: 2, textAlign: 'center' }}
                color="text.primary"
                gutterBottom
              >
                Linked EQ Directory: {fsHandle?.name}.
              </Typography>
              <Typography
                sx={{ fontSize: 17, marginBottom: 2 }}
                color="text.secondary"
                gutterBottom
              >
                Your browser needs to request permission to access files for
                decoding. In addition, decoded files will be written under{' '}
                <b>{fsHandle?.name}/eqsage</b> and can be safely deleted at any
                time.
              </Typography>
              <Button
                variant="outlined"
                sx={{ margin: '25px' }}
                onClick={requestPermissions}
              >
                Request Permissions
              </Button>
              <Typography
                sx={{ fontSize: 17, marginBottom: 2 }}
                color="text.secondary"
                gutterBottom
              >
                If you want to grant persistent permissions and are using
                Chrome, you can enable the{' '}
                <b>#file-system-access-persistent-permission</b> flag under{' '}
                <b>chrome://flags</b>. Once enabled, you need to restart your
                browser for this to take effect.
              </Typography>
              <Box className="chrome-flags" sx={{ width: '100%' }} />
            </Stack>
          )}
          {
            permissionStatus === PermissionStatusTypes.NeedEQDir && (
              <Stack
                direction={'column'}
                sx={{
                  justifyContent: 'center !important',
                  alignItems    : 'center',
                  alignContent  : 'center',
                }}
              >
                <Typography
                  sx={{ fontSize: 17, marginBottom: 2 }}
                  color="text.secondary"
                  gutterBottom
                >
                 Drag and drop an EQ directory on the page to get started. All
                  Windows versions are compatible, but keep in mind availability
                  and version of zones related to the database linked, e.g. old
                  Freeport vs. new. This should be your base EQ directory
                  including all the s3d/eqg files.
                </Typography>
                <Button
                  onClick={async () => {
                    onFolderSelected();
                  }}
                  variant={'outlined'}
                  sx={{ margin: '0 auto' }}
                >
                  Select EQ Directory
                </Button>
              </Stack>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
