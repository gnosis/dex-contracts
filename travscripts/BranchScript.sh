#!/bin/bash

if [[ $TRAVIS_BRANCH = "master" || $TRAVIS_BRANCH = "develop" ]]; then
  echo " ==> Detected PRINCIPAL branch - compiling and testing contracts"
  #jump back to root
  cd $TRAVIS_BUILD_DIR
  echo " ==> JUMPING LOCATIONS: NOW IN $TRAVIS_BUILD_DIR"

  # running contracts tests
  echo " ==> RUNNING test"
  npm test;

  echo " ==> RUNNING JS lint"
  npm run lint;

  echo " ==> RUNNING Solidity lint"
  npm run solhint
else
  echo " ==> No execution for branches other than MASTER or DEVELOP"
fi;