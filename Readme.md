### Token Host Builder 

 - Read more at https://tokenhost.com

## Setup:

1. configure the json for your site in contracts.json using tokenhost.com or https://github.com/tokenhost/tokenhost-www or just use default example to make a Job site

2. install deps ie npm, yarn. currently node v19.7.0 is working great

3. Compile and dev your site:

``` 
yarn
yarn run build
```

4. you have now built your new site. This sin the folder site, to interact with it go to http://localhost:3000 after:
```
cd site
yarn run dev
```

5. init a new git repo in the site folder and use that as the basis for your new dapp
