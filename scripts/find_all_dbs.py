import os, glob

appdata = os.environ.get('APPDATA', '')
localappdata = os.environ.get('LOCALAPPDATA', '')

print('Checking APPDATA:', appdata)
for root, dirs, files in os.walk(appdata):
    if 'farmacia.db' in files:
        print('Found DB in APPDATA:', os.path.join(root, 'farmacia.db'))

print('Checking LOCALAPPDATA:', localappdata)
for root, dirs, files in os.walk(localappdata):
    if 'farmacia.db' in files:
        print('Found DB in LOCALAPPDATA:', os.path.join(root, 'farmacia.db'))

