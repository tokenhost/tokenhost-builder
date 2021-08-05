Making A BlockChain Application Without Breaking a Sweat Using Token Host
=========================================================================

[![tokenhost](https://miro.medium.com/fit/c/56/56/0*PZDwl1p20RzHKGxW.jpg)](https://medium.com/@tokenhost?source=post_page-----7921a9bbc3fc--------------------------------)[ tokenhost ](https://medium.com/@tokenhost?source=post_page-----7921a9bbc3fc--------------------------------)[ Jul 22·4 min read ](https://medium.com/@tokenhost/making-blockchain-application-without-breaking-a-sweat-with-token-host-7921a9bbc3fc?source=post_page-----7921a9bbc3fc--------------------------------)

Why Use a BlockChain
====================

Blockchain is a way to decentralize data storage. Therefore, this technology can be used as a substitute for traditional databases. Blockchain provides functions that can be used to create application architectures, including transparency of operations and of course, decentralized data storage. The data on the public blockchain cannot be modified and can be easily checked by any internet user.

In this tutorial, we will create a web application that uses a blockchain instead of a centralized database, using Token Host’s easy-to-use website. Let’s explore in practice what are the functions of this technology and how to use them in its development!

**The Project**
===============

In order to show you how to use Token Host’s application builder, we are going to make our very own job board. This project aims to solve a real-world problem — helping eligible candidates find jobs. Anyone is able to post their information and employers are able to view all candidates to find someone who is the right fit.

The Goal:
=========

*   Create a working job board in 15 minutes using Token Host’s innovative BlockChain application technology.

Step-By-Step Overview
=====================

Signing in:
-----------

Head on over to [Token Host Application Builder](http://app.tokenhost.com). Sign in using Google, Facebook, Email, or your Metamask accounts.

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*2kWp7tEJLoRq5mvi" width="700" height="500" srcSet="https://miro.medium.com/max/552/0\*2kWp7tEJLoRq5mvi 276w, https://miro.medium.com/max/1104/0\*2kWp7tEJLoRq5mvi 552w, https://miro.medium.com/max/1280/0\*2kWp7tEJLoRq5mvi 640w, https://miro.medium.com/max/1400/0\*2kWp7tEJLoRq5mvi 700w" sizes="700px" role="presentation"/>

Creating the Contracts Json Data:
=================================

Hit the blue App Builder button on the top of the screen and you will be greeted with this page:

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*91KGExsnT-PfGSUV" width="700" height="390" srcSet="https://miro.medium.com/max/552/0\*91KGExsnT-PfGSUV 276w, https://miro.medium.com/max/1104/0\*91KGExsnT-PfGSUV 552w, https://miro.medium.com/max/1280/0\*91KGExsnT-PfGSUV 640w, https://miro.medium.com/max/1400/0\*91KGExsnT-PfGSUV 700w" sizes="700px" role="presentation"/>

Click on that blue “Edit” button in the top right:

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*Rw4IcgHcOVwMi4lN" width="700" height="393" srcSet="https://miro.medium.com/max/552/0\*Rw4IcgHcOVwMi4lN 276w, https://miro.medium.com/max/1104/0\*Rw4IcgHcOVwMi4lN 552w, https://miro.medium.com/max/1280/0\*Rw4IcgHcOVwMi4lN 640w, https://miro.medium.com/max/1400/0\*Rw4IcgHcOVwMi4lN 700w" sizes="700px" role="presentation"/>

You will have this new screen appear. Let’s go ahead and fill in the “Current Sub Domain” , and “Contract Name.”

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*YvyaemTdOqt06KZ9" width="700" height="388" srcSet="https://miro.medium.com/max/552/0\*YvyaemTdOqt06KZ9 276w, https://miro.medium.com/max/1104/0\*YvyaemTdOqt06KZ9 552w, https://miro.medium.com/max/1280/0\*YvyaemTdOqt06KZ9 640w, https://miro.medium.com/max/1400/0\*YvyaemTdOqt06KZ9 700w" sizes="700px" role="presentation"/>

Now let’s go ahead and fill in some “Field Names’ to give our users a place to input information about themselves. Hint: remember to set the “Field Type” to “string” because we want out potential candidates to input text into our fields.

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*4T3ioAjb038wrceg" width="700" height="393" srcSet="https://miro.medium.com/max/552/0\*4T3ioAjb038wrceg 276w, https://miro.medium.com/max/1104/0\*4T3ioAjb038wrceg 552w, https://miro.medium.com/max/1280/0\*4T3ioAjb038wrceg 640w, https://miro.medium.com/max/1400/0\*4T3ioAjb038wrceg 700w" sizes="700px" role="presentation"/>

Now that we have completed the fields. Go ahead and hit the save button. Once you are done with that, go ahead and hit the cancel button. It should take you to this screen:

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*y2mRPEz5sXuXV3VJ" width="700" height="392" srcSet="https://miro.medium.com/max/552/0\*y2mRPEz5sXuXV3VJ 276w, https://miro.medium.com/max/1104/0\*y2mRPEz5sXuXV3VJ 552w, https://miro.medium.com/max/1280/0\*y2mRPEz5sXuXV3VJ 640w, https://miro.medium.com/max/1400/0\*y2mRPEz5sXuXV3VJ 700w" sizes="700px" role="presentation"/>

From here, click on the “Hosted SubDomain” link, in our case it is [https://job-board.tokenhost.com](https://job-board.tokenhost.com). The site may take a few minutes to load, but when it is done it should look like this:

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*ATLDhxVHn0izQD7n" width="700" height="420" srcSet="https://miro.medium.com/max/552/0\*ATLDhxVHn0izQD7n 276w, https://miro.medium.com/max/1104/0\*ATLDhxVHn0izQD7n 552w, https://miro.medium.com/max/1280/0\*ATLDhxVHn0izQD7n 640w, https://miro.medium.com/max/1400/0\*ATLDhxVHn0izQD7n 700w" sizes="700px" role="presentation"/>

Then after we add our first posting:

<img alt="" class="fc el eh kp w" src="https://miro.medium.com/max/1400/0\*PLSeQNQjg9fhrbBK" width="700" height="419" srcSet="https://miro.medium.com/max/552/0\*PLSeQNQjg9fhrbBK 276w, https://miro.medium.com/max/1104/0\*PLSeQNQjg9fhrbBK 552w, https://miro.medium.com/max/1280/0\*PLSeQNQjg9fhrbBK 640w, https://miro.medium.com/max/1400/0\*PLSeQNQjg9fhrbBK 700w" sizes="700px" role="presentation"/>

That’s it! Your own fully functional Job Board! Play around with it and make some applications.

Conclusion:
===========

In short, we have implemented the job board, our fully developed web application. Blockchain is a convenient and reliable way to store data. Token Host’s BlockChain application builder is a great tool to use and should be integrated into your application.

By using a blockchain instead of a conventional centralized database, you can add unique features to your application and increase its value to users. There are many tools in the Waves ecosystem to simplify the development process.

Develop applications on the Token Host blockchain, join our developer community and ask any question in our Discord or on our Twitter!

Follow [Token Host Twitter](https://twitter.com/tokenhost)

Join [Token Host Discord](https://discord.gg/q6fj5ZSv)
