#!/bin/bash
echo "Deploying clipboard and API fixes..."

# Backup current files
cp /opt/flew/app/dashboard/src/utils/clipboard.ts /opt/flew/app/dashboard/src/utils/clipboard.ts.backup
cp /opt/flew/app/routers/system.py /opt/flew/app/routers/system.py.backup

# Copy fixed files
cp /root/Flew/app/dashboard/src/utils/clipboard.ts /opt/flew/app/dashboard/src/utils/clipboard.ts
cp /root/Flew/app/routers/system.py /opt/flew/app/routers/system.py

# Rebuild frontend
cd /opt/flew
./build_dashboard.sh

# Restart service
systemctl restart flew

echo "Deployment completed. Fixes should now be active."
