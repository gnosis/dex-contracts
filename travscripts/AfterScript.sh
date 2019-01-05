#!/bin/bash

if [[ $TRAVIS_BRANCH =~ (feature/test-?(\/[a-zA-Z0-9/._-]*)?) ]]; then
  echo " ==> Detected a CONTRACT(S) branch"
  #jump back to root
  cd $TRAVIS_BUILD_DIR
  echo " ==> JUMPING LOCATIONS: NOW IN $TRAVIS_BUILD_DIR"
  #run solcover
  echo " ==> RUNNING solidity-coverage" &&

  npm run coverage && cat coverage/lcov.info | coveralls
fi;