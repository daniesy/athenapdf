#!/bin/bash

dnf -y update
dnf -y install golang \
nodejs \
git \
epel-release \
dejavu-sans-fonts.noarch dejavu-sans-fonts.noarch dejavu-sans-mono-fonts.noarch \
dejavu-sans-fonts.noarch dejavu-sans-fonts.noarch \
dejavu-sans-fonts.noarch \
google-noto-emoji-color-fonts.noarch \
liberation-fonts-common \
liberation-fonts \
gnu-free-fonts-common \
gnu-free-mono-fonts \
gnu-free-sans-fonts \
gnu-free-serif-fonts \
google-droid-serif-fonts.noarch google-droid-sans-mono-fonts.noarch google-droid-sans-fonts.noarch \
supervisor
ssh-keygen
cat ~/.ssh/id_rsa.pub
echo "Please add the ssh key to your repo and press any key to continue"
read -n 1


default_repo="https://github.com/username/repo.git"
default_folder="/app"

read -p "Enter git repo URL [default: $default_repo]: " repo_url
# Set repo url to default if empty
if [ -z "$repo_url" ]; then
  repo_url="$default_repo"
fi

# Clone repo to specified folder
git clone "$repo_url" "$default_folder"

echo "Repo cloned to $default_folder"

cp /app/.config/cloud.ini /etc/supervisord.d/

echo "Downloading npm dependecies"
cd /app/cli/
npm i

echo "Building the go app"
cd /app/weaver/
CGO_ENABLED=0 go build -v -o bin/weaver .

supervisorctl reread
supervisorctl update
supervisorctl start all
supervisorctl tail -f weaver

#export PATH="/app/cli/bin:$PATH"
#export WEAVER_HTTPS_ADDR=api.htmlconverter.cloud:443
#export WEAVER_TLS_CERT_FILE=/etc/letsencrypt/live/api.htmlconverter.cloud/fullchain.pem
#export WEAVER_TLS_KEY_FILE=/etc/letsencrypt/live/api.htmlconverter.cloud/privkey.pem