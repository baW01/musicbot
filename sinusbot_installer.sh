#!/bin/bash
# SinusBot installer by Philipp Eßwein - DAThosting.eu philipp.esswein@dathosting.eu
# Improved and updated version

# Set strict mode
set -uo pipefail
trap 'err_report $LINENO' ERR

# Vars
MACHINE=$(uname -m)
Instversion="1.6"
USE_SYSTEMD=true

# Functions

function greenMessage() {
  echo -e "\\033[32;1m${*}\\033[0m"
}

function magentaMessage() {
  echo -e "\\033[35;1m${*}\\033[0m"
}

function cyanMessage() {
  echo -e "\\033[36;1m${*}\\033[0m"
}

function redMessage() {
  echo -e "\\033[31;1m${*}\\033[0m"
}

function yellowMessage() {
  echo -e "\\033[33;1m${*}\\033[0m"
}

function errorQuit() {
  errorExit 'Exit now!'
}

function errorExit() {
  redMessage "${@}"
  exit 1
}

function errorContinue() {
  redMessage "Invalid option."
  return
}

function makeDir() {
  if [ -n "$1" ] && [ ! -d "$1" ]; then
    mkdir -p "$1"
  fi
}

err_report() {
  local line=$1
  redMessage "Error occurred on line $line. The last command failed."
  exit 1
}

# OS Detection
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VER=$VERSION_ID
    OS_NAME=$PRETTY_NAME
  elif [ -f /etc/debian_version ]; then
    OS="debian"
    OS_VER=$(cat /etc/debian_version)
  elif [ -f /etc/centos-release ]; then
    OS="centos"
    OS_VER=$(cat /etc/centos-release | tr -dc '0-9.' | cut -d. -f1)
  else
    errorExit "Unsupported OS. Please use Debian, Ubuntu, or CentOS/RHEL-based systems."
  fi
  cyanMessage "Detected OS: $OS_NAME ($OS $OS_VER)"
}

# Python 3.10+ Installation
install_python310() {
  greenMessage "Checking for Python 3.10+..."
  local py_bin=""
  if command -v python3.11 &>/dev/null; then py_bin="python3.11"
  elif command -v python3.10 &>/dev/null; then py_bin="python3.10"
  elif command -v python3 &>/dev/null; then
    local ver=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)
    if [[ $(echo "$ver >= 3.10" | bc -l 2>/dev/null) -eq 1 ]]; then py_bin="python3"; fi
  fi

  if [ -n "$py_bin" ]; then
    greenMessage "Python $($py_bin --version) already installed."
    return 0
  fi

  yellowMessage "Python 3.10+ not found. Installing..."
  case "$OS" in
    ubuntu)
      apt-get update -qq
      apt-get install -y software-properties-common
      add-apt-repository -y ppa:deadsnakes/ppa
      apt-get update -qq
      apt-get install -y python3.10 python3.10-distutils
      ;;
    debian)
      apt-get update -qq
      apt-get install -y wget build-essential libreadline-gplv2-dev libncursesw5-dev libssl-dev libsqlite3-dev tk-dev libgdbm-dev libc6-dev libbz2-dev libffi-dev zlib1g-dev
      # For Debian, it's safer to use the version from backports or just rely on newer Debian releases
      if [[ "$OS_VER" == "11" ]]; then
        # Debian 11 has 3.9, we might need to compile or use a repo
        yellowMessage "Debian 11 detected. Installing Python 3.10 from source might take a while..."
        # Better approach: advise upgrade or use a trusted repo if available
        apt-get install -y python3.10 || errorExit "Could not install Python 3.10 on Debian 11 easily. Please upgrade to Debian 12."
      else
        apt-get install -y python3.10 || apt-get install -y python3
      fi
      ;;
    centos|rhel|almalinux|rocky)
      if command -v dnf &>/dev/null; then
        dnf install -y python3.10 || dnf install -y python3
      else
        yum install -y python3.10 || yum install -y python3
      fi
      ;;
  esac
}

# Check if the script was run as root user. Otherwise exit the script
if [ "$(id -u)" != "0" ]; then
  errorExit "Change to root account required!"
fi

detect_os

# Update notify
cyanMessage "Checking for the latest installer version"
if [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "almalinux" || "$OS" == "rocky" ]]; then
  yum -y -q install wget bc
else
  apt-get update -qq
  apt-get -qq install wget bc -y
fi

# Detect if systemctl is available
if [[ $(command -v systemctl) == "" ]]; then
  USE_SYSTEMD=false
fi

# If kernel to old, quit
if [ "$(uname -r | cut -c1)" -lt 3 ]; then
  errorExit "Linux kernel unsupported. Please update your kernel."
fi

greenMessage "This is the automatic installer for latest SinusBot. USE AT YOUR OWN RISK!"
sleep 1
yellowMessage "You're using installer $Instversion"

# selection menu if the installer should install, update, remove or pw reset the SinusBot
redMessage "What should the installer do?"
OPTIONS=("Install" "Update" "Remove" "PW Reset" "Quit")
select OPTION in "${OPTIONS[@]}"; do
  case "$REPLY" in
  1 | 2 | 3 | 4) break ;;
  5) errorQuit ;;
  *) errorContinue ;;
  esac
done

if [ "$OPTION" == "Install" ]; then
  INSTALL="Inst"
elif [ "$OPTION" == "Update" ]; then
  INSTALL="Updt"
elif [ "$OPTION" == "Remove" ]; then
  INSTALL="Rem"
elif [ "$OPTION" == "PW Reset" ]; then
  INSTALL="Res"
fi

# Go on
if [ "$INSTALL" != "Rem" ]; then
  if [ "$MACHINE" == "x86_64" ]; then
    ARCH="amd64"
  else
    errorExit "$MACHINE is not supported"!
  fi
fi

if [[ "$INSTALL" != "Rem" ]]; then
  if [[ "$USE_SYSTEMD" == true ]]; then
    yellowMessage "Automatically chosen systemd for your startscript!"
  else
    yellowMessage "Automatically chosen init.d for your startscript!"
  fi
fi

# PW Reset
if [[ $INSTALL == "Res" ]]; then
  yellowMessage "Automatic usage or own directories?"

  OPTIONS=("Automatic" "Own path" "Quit")
  select OPTION in "${OPTIONS[@]}"; do
    case "$REPLY" in
    1 | 2) break ;;
    3) errorQuit ;;
    *) errorContinue ;;
    esac
  done

  if [ "$OPTION" == "Automatic" ]; then
    LOCATION=/opt/sinusbot
  elif [ "$OPTION" == "Own path" ]; then
    yellowMessage "Enter location where the bot should be installed/updated/removed. Like /opt/sinusbot. Include the / at first position and none at the end!"

    LOCATION=""
    while [[ ! -d $LOCATION ]]; do
      read -rp "Location [/opt/sinusbot]: " LOCATION
      if [[ $INSTALL != "Inst" && ! -d $LOCATION ]]; then
        redMessage "Directory not found, try again!"
      fi
    done

    greenMessage "Your directory is $LOCATION."

    OPTIONS=("Yes" "No, change it" "Quit")
    select OPTION in "${OPTIONS[@]}"; do
      case "$REPLY" in
      1 | 2) break ;;
      3) errorQuit ;;
      *) errorContinue ;;
      esac
    done

    if [ "$OPTION" == "No, change it" ]; then
      LOCATION=""
      while [[ ! -d $LOCATION ]]; do
        read -rp "Location [/opt/sinusbot]: " LOCATION
        if [[ $INSTALL != "Inst" && ! -d $LOCATION ]]; then
          redMessage "Directory not found, try again!"
        fi
      done
      greenMessage "Your directory is $LOCATION."
    fi
  fi

  LOCATIONex=$LOCATION/sinusbot

  if [[ ! -f $LOCATION/sinusbot ]]; then
    errorExit "SinusBot wasn't found at $LOCATION. Exiting script."
  fi

  PW=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 8 | head -n 1)
  SINUSBOTUSER=$(ls -ld $LOCATION | awk '{print $3}')

  greenMessage "Please login to your SinusBot webinterface as admin and '$PW'"
  yellowMessage "After that change your password under Settings->User Accounts->admin->Edit. The script restart the bot with init.d or systemd."

  if [[ -f /lib/systemd/system/sinusbot.service ]]; then
    if [[ $(systemctl is-active sinusbot >/dev/null && echo UP || echo DOWN) == "UP" ]]; then
      systemctl stop sinusbot
    fi
  elif [[ -f /etc/init.d/sinusbot ]]; then
    if [ "$(/etc/init.d/sinusbot status | awk '{print $NF; exit}')" == "UP" ]; then
      /etc/init.d/sinusbot stop
    fi
  fi

  log="/tmp/sinusbot.log"
  match="USER-PATCH [admin] (admin) OK"

  su -c "$LOCATIONex --override-password $PW" $SINUSBOTUSER >"$log" 2>&1 &
  sleep 3

  while true; do
    echo -ne '(Waiting for password change!)\r'
    if grep -Fq "$match" "$log"; then
      pkill -INT -f $PW
      rm "$log"
      greenMessage "Successfully changed your admin password."
      if [[ -f /lib/systemd/system/sinusbot.service ]]; then
        systemctl start sinusbot
        greenMessage "Started your bot with systemd."
      elif [[ -f /etc/init.d/sinusbot ]]; then
        /etc/init.d/sinusbot start
        greenMessage "Started your bot with initd."
      else
        redMessage "Please start your bot normally!"
      fi
      exit 0
    fi
    sleep 1
  done
fi

# Detect Virtualization
VIRTUALIZATION_TYPE=""
if [[ -f "/.dockerenv" ]]; then
  VIRTUALIZATION_TYPE="docker"
fi
if [ -d "/proc/vz" ] && [ ! -d "/proc/bc" ]; then
  VIRTUALIZATION_TYPE="openvz"
fi

if [[ $VIRTUALIZATION_TYPE == "openvz" ]]; then
  redMessage "Warning, your server is running OpenVZ! This old container system isn't well supported."
elif [[ $VIRTUALIZATION_TYPE == "docker" ]]; then
  redMessage "Warning, your server is running Docker!"
fi

# Set path or continue with normal
yellowMessage "Automatic usage or own directories?"

OPTIONS=("Automatic" "Own path" "Quit")
select OPTION in "${OPTIONS[@]}"; do
  case "$REPLY" in
  1 | 2) break ;;
  3) errorQuit ;;
  *) errorContinue ;;
  esac
done

if [ "$OPTION" == "Automatic" ]; then
  LOCATION=/opt/sinusbot
elif [ "$OPTION" == "Own path" ]; then
  yellowMessage "Enter location where the bot should be installed/updated/removed, e.g. /opt/sinusbot. Include the / at first position and none at the end!"
  LOCATION=""
  while [[ ! -d $LOCATION ]]; do
    read -rp "Location [/opt/sinusbot]: " LOCATION
    if [[ $INSTALL != "Inst" && ! -d $LOCATION ]]; then
      redMessage "Directory not found, try again!"
    fi
    if [ "$INSTALL" == "Inst" ]; then
      if [ "$LOCATION" == "" ]; then
        LOCATION=/opt/sinusbot
      fi
      makeDir "$LOCATION"
    fi
  done
  greenMessage "Your directory is $LOCATION."
fi

makeDir "$LOCATION"
LOCATIONex=$LOCATION/sinusbot

# Check if SinusBot already installed and if update is possible
if [[ $INSTALL == "Inst" ]] || [[ $INSTALL == "Updt" ]]; then
  yellowMessage "Should I install TeamSpeak or only Discord Mode?"
  OPTIONS=("Both" "Only Discord" "Quit")
  select OPTION in "${OPTIONS[@]}"; do
    case "$REPLY" in
    1 | 2) break ;;
    3) errorQuit ;;
    *) errorContinue ;;
    esac
  done

  if [ "$OPTION" == "Both" ]; then
    DISCORD="false"
  else
    DISCORD="true"
  fi
fi

if [[ $INSTALL == "Inst" ]]; then
  if [[ -f "$LOCATION/sinusbot" ]]; then
    redMessage "SinusBot already installed at $LOCATION!"
    read -rp "Would you like to update the bot instead? [Y / n]: " OPTION
    if [[ "$OPTION" =~ ^[Yy]?$ ]]; then
      INSTALL="Updt"
    else
      errorExit "Installer stops now!"
    fi
  else
    greenMessage "SinusBot isn't installed yet. Proceeding with installation."
  fi
elif [[ "$INSTALL" == "Rem" || "$INSTALL" == "Updt" ]]; then
  if [[ ! -d "$LOCATION" ]]; then
    errorExit "SinusBot directory not found at $LOCATION!"
  else
    greenMessage "SinusBot directory found. Proceeding."
  fi
fi

# Remove SinusBot

if [ "$INSTALL" == "Rem" ]; then

  SINUSBOTUSER=$(ls -ld $LOCATION | awk '{print $3}')

  if [[ -f /usr/local/bin/youtube-dl ]]; then
    redMessage "Remove YoutubeDL?"

    OPTIONS=("Yes" "No")
    select OPTION in "${OPTIONS[@]}"; do
      case "$REPLY" in
      1 | 2) break ;;
      *) errorContinue ;;
      esac
    done

    if [ "$OPTION" == "Yes" ]; then
      if [[ -f /usr/local/bin/youtube-dl ]]; then
        rm /usr/local/bin/youtube-dl
      fi

      if [[ -f /etc/cron.d/ytdl ]]; then
        rm /etc/cron.d/ytdl
      fi

      greenMessage "Removed YT-DL successfully"!
    fi
  fi

  if [[ -z $SINUSBOTUSER ]]; then
    errorExit "No SinusBot found. Exiting now."
  fi

  redMessage "SinusBot will now be removed completely from your system"!

  greenMessage "Your SinusBot user is \"$SINUSBOTUSER\"? The directory which will be removed is \"$LOCATION\". After select Yes it could take a while."

  OPTIONS=("Yes" "No")
  select OPTION in "${OPTIONS[@]}"; do
    case "$REPLY" in
    1) break ;;
    2) errorQuit ;;
    *) errorContinue ;;
    esac
  done

  if [ "$(ps ax | grep sinusbot | grep SCREEN)" ]; then
    ps ax | grep sinusbot | grep SCREEN | awk '{print $1}' | while read PID; do
      kill $PID
    done
  fi

  if [ "$(ps ax | grep ts3bot | grep SCREEN)" ]; then
    ps ax | grep ts3bot | grep SCREEN | awk '{print $1}' | while read PID; do
      kill $PID
    done
  fi

  if [[ -f /lib/systemd/system/sinusbot.service ]]; then
    if [[ $(systemctl is-active sinusbot >/dev/null && echo UP || echo DOWN) == "UP" ]]; then
      service sinusbot stop
      systemctl disable sinusbot
    fi
    rm /lib/systemd/system/sinusbot.service
  elif [[ -f /etc/init.d/sinusbot ]]; then
    if [ "$(/etc/init.d/sinusbot status | awk '{print $NF; exit}')" == "UP" ]; then
      su -c "/etc/init.d/sinusbot stop" $SINUSBOTUSER
      su -c "screen -wipe" $SINUSBOTUSER
      update-rc.d -f sinusbot remove >/dev/null
    fi
    rm /etc/init.d/sinusbot
  fi

  if [[ -f /etc/cron.d/sinusbot ]]; then
    rm /etc/cron.d/sinusbot
  fi

  if [ "$LOCATION" ]; then
    rm -R $LOCATION >/dev/null
    greenMessage "Files removed successfully"!
  else
    redMessage "Error while removing files."
  fi

  if [[ $SINUSBOTUSER != "root" ]]; then
    redMessage "Remove user \"$SINUSBOTUSER\"? (User will be removed from your system)"

    OPTIONS=("Yes" "No")
    select OPTION in "${OPTIONS[@]}"; do
      case "$REPLY" in
      1 | 2) break ;;
      *) errorContinue ;;
      esac
    done

    if [ "$OPTION" == "Yes" ]; then
      userdel -r -f $SINUSBOTUSER >/dev/null

      if [ "$(id $SINUSBOTUSER 2>/dev/null)" == "" ]; then
        greenMessage "User removed successfully"!
      else
        redMessage "Error while removing user"!
      fi
    fi
  fi

  greenMessage "SinusBot removed completely including all directories."

  exit 0
fi

# Private usage only!

redMessage "This SinusBot version is only for private use! Accept?"

OPTIONS=("No" "Yes")
select OPTION in "${OPTIONS[@]}"; do
  case "$REPLY" in
  1) errorQuit ;;
  2) break ;;
  *) errorContinue ;;
  esac
done

# Ask for YT-DLP
redMessage "Should YT-DLP be installed/updated?"
OPTIONS=("Yes" "No")
select OPTION in "${OPTIONS[@]}"; do
  case "$REPLY" in
  1 | 2) break ;;
  *) errorContinue ;;
  esac
done

if [ "$OPTION" == "Yes" ]; then
  YT="Yes"
fi

# Update packages or not
redMessage 'Update the system packages to the latest version? (Recommended)'
OPTIONS=("Yes" "No")
select OPTION in "${OPTIONS[@]}"; do
  case "$REPLY" in
  1 | 2) break ;;
  *) errorContinue ;;
  esac
done

greenMessage "Starting the installer now!"
sleep 2

if [ "$OPTION" == "Yes" ]; then
  greenMessage "Updating the system in a few seconds!"
  sleep 1
  redMessage "This could take a while. Please wait..."
  sleep 3

  if [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "almalinux" || "$OS" == "rocky" ]]; then
    yum -y update
  else
    apt-get update
    apt-get upgrade -y
  fi
fi

# Install Python 3.10+ if needed
if [[ "$INSTALL" != "Rem" ]]; then
  install_python310
fi

# TeamSpeak3-Client latest check
if [ "$DISCORD" == "false" ]; then
  greenMessage "Searching latest TS3-Client build for hardware type $MACHINE with arch $ARCH."
  VERSION="3.5.6"
  DOWNLOAD_URL_VERSION="https://files.teamspeak-services.com/releases/client/$VERSION/TeamSpeak3-Client-linux_$ARCH-$VERSION.run"
  STATUS=$(wget --server-response -L "$DOWNLOAD_URL_VERSION" 2>&1 | awk '/^  HTTP/{print $2}' | tail -n1)
  if [ "$STATUS" == "200" ]; then
    DOWNLOAD_URL=$DOWNLOAD_URL_VERSION
    greenMessage "Detected latest TS3-Client version as $VERSION"
  else
    errorExit "Could not detect latest TS3-Client version (Status: $STATUS)"
  fi
fi

# Install necessary packages for sinusbot.
magentaMessage "Installing necessary packages. Please wait..."

COMMON_DEPS="ca-certificates bzip2 psmisc libglib2.0-0 less python3 iproute2 dbus libnss3 libegl1-mesa x11-xkb-utils libasound2 libxcomposite-dev libxi6 libpci3 libxslt1.1 libxkbcommon0 libxss1"

if [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "almalinux" || "$OS" == "rocky" ]]; then
  yum -y install screen xvfb libXcursor $COMMON_DEPS
  update-ca-trust extract
else
  apt-get update -qq
  apt-get install -y --no-install-recommends libfontconfig libxtst6 screen xvfb libxcursor1 $COMMON_DEPS
  update-ca-certificates
fi

greenMessage "Packages installed!"

# Setting server time
# ... (keeping time setting logic but updating slightly for modern systems)
if [[ $VIRTUALIZATION_TYPE == "openvz" ]]; then
  redMessage "You're using OpenVZ virtualization. Skipping time sync..."
else
  if command -v timedatectl &>/dev/null; then
    timedatectl set-ntp yes || true
    greenMessage "NTP sync enabled via timedatectl."
  fi
fi

USERADD=$(which useradd)
GROUPADD=$(which groupadd)
ipaddress=$(ip route get 8.8.8.8 | awk {'print $7'} | tr -d '\n')

# Create/check user for sinusbot.

if [ "$INSTALL" == "Updt" ]; then
  SINUSBOTUSER=$(ls -ld $LOCATION | awk '{print $3}')
  if [ "$DISCORD" == "false" ]; then
    sed -i "s|TS3Path = \"\"|TS3Path = \"$LOCATION/teamspeak3-client/ts3client_linux_amd64\"|g" $LOCATION/config.ini && greenMessage "Added TS3 Path to config." || redMessage "Error while updating config"
  fi
else

  cyanMessage 'Please enter the name of the sinusbot user. Typically "sinusbot". If it does not exists, the installer will create it.'

  SINUSBOTUSER=""
  while [[ ! $SINUSBOTUSER ]]; do
    read -rp "Username [sinusbot]: " SINUSBOTUSER
    if [ -z "$SINUSBOTUSER" ]; then
      SINUSBOTUSER=sinusbot
    fi
    if [ $SINUSBOTUSER == "root" ]; then
      redMessage "Error. Your username is invalid. Don't use root"!
      SINUSBOTUSER=""
    fi
    if [ -n "$SINUSBOTUSER" ]; then
      greenMessage "Your sinusbot user is: $SINUSBOTUSER"
    fi
  done

  if [ "$(id $SINUSBOTUSER 2>/dev/null)" == "" ]; then
    if [ -d /home/$SINUSBOTUSER ]; then
      $GROUPADD $SINUSBOTUSER
      $USERADD -d /home/$SINUSBOTUSER -s /bin/bash -g $SINUSBOTUSER $SINUSBOTUSER
    else
      $GROUPADD $SINUSBOTUSER
      $USERADD -m -b /home -s /bin/bash -g $SINUSBOTUSER $SINUSBOTUSER
    fi
  else
    greenMessage "User \"$SINUSBOTUSER\" already exists."
  fi

chmod 750 -R $LOCATION
chown -R $SINUSBOTUSER:$SINUSBOTUSER $LOCATION

fi

# Create dirs or remove them.

ps -u $SINUSBOTUSER | grep ts3client | awk '{print $1}' | while read PID; do
  kill $PID
done
if [[ -f $LOCATION/ts3client_startscript.run ]]; then
  rm -rf $LOCATION/*
fi

if [ "$DISCORD" == "false" ]; then

makeDir $LOCATION/teamspeak3-client

chmod 750 -R $LOCATION
chown -R $SINUSBOTUSER:$SINUSBOTUSER $LOCATION
cd $LOCATION/teamspeak3-client

# Downloading TS3-Client files.

if [[ -f CHANGELOG ]] && [ $(cat CHANGELOG | awk '/Client Release/{ print $4; exit }') == $VERSION ]; then
  greenMessage "TS3 already latest version."
else

  greenMessage "Downloading TS3 client files."
  su -c "wget -q $DOWNLOAD_URL" $SINUSBOTUSER

  if [[ ! -f TeamSpeak3-Client-linux_$ARCH-$VERSION.run && ! -f ts3client_linux_$ARCH ]]; then
    errorExit "Download failed! Exiting now"!
  fi
fi

# Installing TS3-Client.

if [[ -f TeamSpeak3-Client-linux_$ARCH-$VERSION.run ]]; then
  greenMessage "Installing the TS3 client."
  redMessage "Read the eula"!
  sleep 1
  yellowMessage 'Do the following: Press "ENTER" then press "q" after that press "y" and accept it with another "ENTER".'
  sleep 2

  chmod 777 ./TeamSpeak3-Client-linux_$ARCH-$VERSION.run

  su -c "./TeamSpeak3-Client-linux_$ARCH-$VERSION.run" $SINUSBOTUSER

  cp -R ./TeamSpeak3-Client-linux_$ARCH/* ./
  sleep 2
  rm ./ts3client_runscript.sh
  rm ./TeamSpeak3-Client-linux_$ARCH-$VERSION.run
  rm -R ./TeamSpeak3-Client-linux_$ARCH

  greenMessage "TS3 client install done."
fi
fi

# Downloading latest SinusBot.

cd $LOCATION

greenMessage "Downloading latest SinusBot."

su -c "wget -q https://www.sinusbot.com/dl/sinusbot.current.tar.bz2" $SINUSBOTUSER
if [[ ! -f sinusbot.current.tar.bz2 && ! -f sinusbot ]]; then
  errorExit "Download failed! Exiting now"!
fi

# Installing latest SinusBot.

greenMessage "Extracting SinusBot files."
su -c "tar -xjf sinusbot.current.tar.bz2" $SINUSBOTUSER
rm -f sinusbot.current.tar.bz2

if [ "$DISCORD" == "false" ]; then

if [ ! -d teamspeak3-client/plugins/ ]; then
  mkdir teamspeak3-client/plugins/
fi

# Copy the SinusBot plugin into the teamspeak clients plugin directory
cp $LOCATION/plugin/libsoundbot_plugin.so $LOCATION/teamspeak3-client/plugins/

if [[ -f teamspeak3-client/xcbglintegrations/libqxcb-glx-integration.so ]]; then
  rm teamspeak3-client/xcbglintegrations/libqxcb-glx-integration.so
fi
fi

chmod 755 sinusbot

if [ "$INSTALL" == "Inst" ]; then
  greenMessage "SinusBot installation done."
elif [ "$INSTALL" == "Updt" ]; then
  greenMessage "SinusBot update done."
fi

if [[ "$USE_SYSTEMD" == true ]]; then

  greenMessage "Starting systemd installation"

  if [[ -f /etc/systemd/system/sinusbot.service ]]; then
    service sinusbot stop
    systemctl disable sinusbot
    rm /etc/systemd/system/sinusbot.service
  fi

  cd /lib/systemd/system/

  wget -q https://raw.githubusercontent.com/Sinusbot/linux-startscript/master/sinusbot.service

  if [ ! -f sinusbot.service ]; then
    errorExit "Download failed! Exiting now"!
  fi

  sed -i 's/User=YOUR_USER/User='$SINUSBOTUSER'/g' /lib/systemd/system/sinusbot.service
  sed -i 's!ExecStart=YOURPATH_TO_THE_BOT_BINARY!ExecStart='$LOCATIONex'!g' /lib/systemd/system/sinusbot.service
  sed -i 's!WorkingDirectory=YOURPATH_TO_THE_BOT_DIRECTORY!WorkingDirectory='$LOCATION'!g' /lib/systemd/system/sinusbot.service

  systemctl daemon-reload
  systemctl enable sinusbot.service

  greenMessage 'Installed systemd file to start the SinusBot with "service sinusbot {start|stop|status|restart}"'

elif [[ "$USE_SYSTEMD" == false ]]; then

  greenMessage "Starting init.d installation"

  cd /etc/init.d/

  wget -q https://raw.githubusercontent.com/Sinusbot/linux-startscript/obsolete-init.d/sinusbot

  if [ ! -f sinusbot ]; then
    errorExit "Download failed! Exiting now"!
  fi

  sed -i 's/USER="mybotuser"/USER="'$SINUSBOTUSER'"/g' /etc/init.d/sinusbot
  sed -i 's!DIR_ROOT="/opt/ts3soundboard/"!DIR_ROOT="'$LOCATION'/"!g' /etc/init.d/sinusbot

  chmod +x /etc/init.d/sinusbot

  if [[ -f /etc/centos-release ]]; then
    chkconfig sinusbot on >/dev/null
  else
    update-rc.d sinusbot defaults >/dev/null
  fi

  greenMessage 'Installed init.d file to start the SinusBot with "/etc/init.d/sinusbot {start|stop|status|restart|console|update|backup}"'
fi

cd $LOCATION

if [ "$INSTALL" == "Inst" ]; then
  if [ "$DISCORD" == "false" ]; then
    if [[ ! -f $LOCATION/config.ini ]]; then
      echo 'ListenPort = 8087
      ListenHost = "0.0.0.0"
      TS3Path = "'$LOCATION'/teamspeak3-client/ts3client_linux_amd64"
      YoutubeDLPath = ""' >>$LOCATION/config.ini
      greenMessage "config.ini created successfully."
    else
      redMessage "config.ini already exists or creation error"!
    fi
  else
    if [[ ! -f $LOCATION/config.ini ]]; then
      echo 'ListenPort = 8087
      ListenHost = "0.0.0.0"
      TS3Path = ""
      YoutubeDLPath = ""' >>$LOCATION/config.ini
      greenMessage "config.ini created successfully."
    else
      redMessage "config.ini already exists or creation error"!
    fi
  fi
fi

#if [[ -f /etc/cron.d/sinusbot ]]; then
#  redMessage "Cronjob already set for SinusBot updater"!
#else
#  greenMessage "Installing Cronjob for automatic SinusBot update..."
#  echo "0 0 * * * $SINUSBOTUSER $LOCATION/sinusbot -update >/dev/null" >>/etc/cron.d/sinusbot
#  greenMessage "Installing SinusBot update cronjob successful."
#fi

# Installing YT-DLP.
if [ "$YT" == "Yes" ]; then
  greenMessage "Installing YT-DLP now!"
  YTDL_BIN="/usr/local/bin/youtube-dl"

  # Remove old cronjobs
  if [ -f /etc/cron.d/ytdl ]; then
    rm /etc/cron.d/ytdl
    yellowMessage "Updating YT-DLP cronjob."
  fi

  greenMessage "Installing Cronjob for automatic YT-DLP update..."
  echo "0 0 * * * root PATH=$PATH:/usr/local/bin; $YTDL_BIN -U --restrict-filename >/dev/null" >>/etc/cron.d/ytdl
  greenMessage "Installing Cronjob successful."

  sed -i "s|YoutubeDLPath = .*|YoutubeDLPath = \"$YTDL_BIN\"|g" "$LOCATION/config.ini"

  if [[ -f "$YTDL_BIN" ]]; then
    rm "$YTDL_BIN"
  fi

  greenMessage "Downloading latest YT-DLP..."
  wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O "$YTDL_BIN"

  if [ ! -f "$YTDL_BIN" ]; then
    errorExit "YT-DLP download failed!"
  else
    greenMessage "YT-DLP download successful!"
  fi

  chmod a+rx "$YTDL_BIN"
  # Try to update/self-update to ensure it's working
  "$YTDL_BIN" -U --restrict-filename || true
fi

# Creating Readme

if [ ! -a "$LOCATION/README_installer.txt" ] && [ "$USE_SYSTEMD" == true ]; then
  echo '##################################################################################
# #
# Usage: service sinusbot {start|stop|status|restart} #
# - start: start the bot #
# - stop: stop the bot #
# - status: display the status of the bot (down or up) #
# - restart: restart the bot #
# #
##################################################################################' >>$LOCATION/README_installer.txt
elif [ ! -a "$LOCATION/README_installer.txt" ] && [ "$USE_SYSTEMD" == false ]; then
  echo '##################################################################################
  # #
  # Usage: /etc/init.d/sinusbot {start|stop|status|restart|console|update|backup} #
  # - start: start the bot #
  # - stop: stop the bot #
  # - status: display the status of the bot (down or up) #
  # - restart: restart the bot #
  # - console: display the bot console #
  # - update: runs the bot updater (with start & stop)
  # - backup: archives your bot root directory
  # To exit the console without stopping the server, press CTRL + A then D. #
  # #
  ##################################################################################' >>$LOCATION/README_installer.txt
fi

greenMessage "Generated README_installer.txt"!

# Delete files if exists

if [[ -f /tmp/.sinusbot.lock ]]; then
  rm /tmp/.sinusbot.lock
  greenMessage "Deleted /tmp/.sinusbot.lock"
fi

if [ -e /tmp/.X11-unix/X40 ]; then
  rm /tmp/.X11-unix/X40
  greenMessage "Deleted /tmp/.X11-unix/X40"
fi

# Starting SinusBot first time!

if [ "$INSTALL" != "Updt" ]; then
  greenMessage 'Starting the SinusBot. For first time.'
  chown -R $SINUSBOTUSER:$SINUSBOTUSER $LOCATION
  cd $LOCATION

  # Password variable

  export Q=$(su $SINUSBOTUSER -c './sinusbot --initonly')
  password=$(export | awk '/password/{ print $10 }' | tr -d "'")
  if [ -z "$password" ]; then
    errorExit "Failed to read password, try a reinstall again."
  fi

  chown -R $SINUSBOTUSER:$SINUSBOTUSER $LOCATION

  # Starting bot
  greenMessage "Starting SinusBot again."
fi

if [[ "$USE_SYSTEMD" == true ]]; then
  service sinusbot start
elif [[ "$USE_SYSTEMD" == false ]]; then
  /etc/init.d/sinusbot start
fi
yellowMessage "Please wait... This will take some seconds"!
chown -R $SINUSBOTUSER:$SINUSBOTUSER $LOCATION

if [[ "$USE_SYSTEMD" == true ]]; then
  sleep 5
elif [[ "$USE_SYSTEMD" == false ]]; then
  sleep 10
fi

if [[ -f /etc/centos-release ]]; then
  if [ "$FIREWALL" == "ip" ]; then
    iptables -A INPUT -p tcp -m state --state NEW -m tcp --dport 8087 -j ACCEPT
  elif [ "$FIREWALL" == "fs" ]; then
    if rpm -q --quiet firewalld; then
      zone=$(firewall-cmd --get-active-zones | awk '{print $1; exit}')
      firewall-cmd --zone=$zone --add-port=8087/tcp --permanent >/dev/null
      firewall-cmd --reload >/dev/null
    fi
  fi
fi

# If startup failed, the script will start normal sinusbot without screen for looking about errors. If startup successed => installation done.
IS_RUNNING=false
if [[ "$USE_SYSTEMD" == true ]]; then
  if [[ $(systemctl is-active sinusbot >/dev/null && echo UP || echo DOWN) == "UP" ]]; then
    IS_RUNNING=true
  fi
elif [[ "$USE_SYSTEMD" == false ]]; then
  if [[ $(/etc/init.d/sinusbot status | awk '{print $NF; exit}') == "UP" ]]; then
     IS_RUNNING=true
  fi
fi

if [[ "$IS_RUNNING" == true ]]; then
  if [[ $INSTALL == "Inst" ]]; then
    greenMessage "Install done"!
  elif [[ $INSTALL == "Updt" ]]; then
    greenMessage "Update done"!
  fi

  if [[ ! -f $LOCATION/README_installer.txt ]]; then
    yellowMessage "Generated a README_installer.txt in $LOCATION with all commands for the sinusbot..."
  fi

  if [[ $INSTALL == "Updt" ]]; then
    if [[ -f /lib/systemd/system/sinusbot.service ]]; then
      service sinusbot restart
      greenMessage "Restarted your bot with systemd."
    fi
    if [[ -f /etc/init.d/sinusbot ]]; then
      /etc/init.d/sinusbot restart
      greenMessage "Restarted your bot with initd."
    fi
    greenMessage "All right. Everything is updated successfully. SinusBot is UP on '$ipaddress:8087' :)"
  else
    greenMessage "All right. Everything is installed successfully. SinusBot is UP on '$ipaddress:8087' :) Your user = 'admin' and password = '$password'"
  fi
  if [[ "$USE_SYSTEMD" == true ]]; then
    redMessage 'Stop it with "service sinusbot stop".'
  elif [[ "$USE_SYSTEMD" == false ]]; then
    redMessage 'Stop it with "/etc/init.d/sinusbot stop".'
  fi
  magentaMessage "Don't forget to rate this script on: https://forum.sinusbot.com/resources/sinusbot-installer-script.58/"
  greenMessage "Thank you for using this script! :)"

else
  redMessage "SinusBot could not start! Starting it directly. Look for errors"!
  su -c "$LOCATION/sinusbot" $SINUSBOTUSER
fi

exit 0
