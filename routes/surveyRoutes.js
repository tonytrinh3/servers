//lec 179
const _ = require('lodash');
//lec 180 errors
const { Path } = require ('path-parser');
//url is default in node.js, can help parse url
const { URL } = require ('url');

const mongoose = require ('mongoose');
const requireLogin = require('../middlewares/requireLogin');
const requireCredits = require('../middlewares/requireCredits');
const Mailer = require('../services/Mailer');
const surveyTemplate = require('../services/emailTemplates/surveyTemplate');

//this is to side step problems when running survey tests
//using mongoose with any type of testing framework, sometimes complain if you attempt to require in a model file multiple times
//just to skirt that issue, we do the below.
//pass in string with name of model we had assigned to
//we could certainly require directly out of survey file in models folder, but we are doing this here, different approach, to sidestep that issue around running tests that you might run into at some point in the future if you had tested this project
const Survey = mongoose.model('surveys');


module.exports = app => {
    //lec 191
    app.get('/api/surveys', requireLogin, async (req,res) => {
        const surveys = await Survey.find({ _user: req.user.id })
            .select({recipients: false});
            
        res.send(surveys);

    });

    //lect 140wefaa
    app.get('/api/surveys/:surveyId/:choice', (req, res) => {
        res.send('Thanks for voting');
    });

    //lec 173
    //this is to extract yes or no choices from email in order to record the answers bitches
    app.post('/api/surveys/webhooks', (req, res) => {
        // //console.log(req.body);
        // //or pass {email, url} to clean up
        // //lec 181
        // const events = _.map(req.body, (event) =>{
        //     const pathname = new URL(event.url).pathname;
        //     const p = new Path('/api/surveys/:surveyId/:choice');
        //    const match = p.test(pathname);
        //    if (match) {
        //        return { email: event.email, surveyId: match.surveyId, choice: match.choice  };
        //    }
        // });
        // //lec 182 this is for to get unique survey 
        // const compactEvents = _.compact(events);
        // const uniqueEvents = _.uniqBy(compactEvents, 'email','surveyId');

        //lec 183 lodash chain helper
        const p = new Path('/api/surveys/:surveyId/:choice');
        //const events = 
        _.chain(req.body)
        .map(({ email, url }) => {
            const match = p.test(new URL(url).pathname);
            if (match){
                return { email, surveyId: match.surveyId, choice: match.choice };
            }
        })
        .compact()
        .uniqBy('email','surveyId')
        //lec 187
        .each( ({ surveyId, email, choice }) => {
            Survey.updateOne(
                {
                    _id: surveyId,
                    recipients: {
                    $elemMatch: { email: email, responded: false}
                    }

                }, 
                {
                $inc: { [choice]: 1 },
                $set: { 'recipients.$.responded': true},
                lastResponded: new Date()
                }
            ).exec();
        })
        .value();

        //console.log(events);

        res.send({});

    });


    app.post("/api/surveys",requireLogin, requireCredits, async (req,res) => {
        //lec 123
        //design backend server assuming that we are goign to pass along these properties
        //we are going to make sure when we move back to the react redux side of the application, we will make sure that when we pass off these properties or when we create a new survey on the front end, we pass along all these different properties as well
        //we are just saying this const below is how we want this back end route to be working 
        //a lot of professional project - it is more common to start in the back end first
        //ok here is the different routes we are going to have. here are the different requirements of each handler and that is exactly what we have done so far
       const { title, subject, body, recipients } = req.body;
       //lower case mean instance of a survey
       const survey = new Survey({
           title: title, //or title, bc E6 syntax
           subject,
           body,
           //lec 124
           //recipients - array of objects containing email addresses
           //this return array of strings, for every email address, return an object, with the property email that points out the user's email
            //when javascript sees this line of code {email}, js will get confused bc it will not understand if we are defining a function body or if we are defining a kind of shortened object right here and we are actually defining a shortened object
            //so to make sure that is clear to javascript interpreter, we are going to wrap {email} in parathese
    
            //or recipients: recipients.split(',').map(email => {return { email: email.trim() }} ),
            recipients: recipients.split(',').map(email => ({ email: email.trim() }) ),
            
            //id is auto generated by mongoose in mongoDB. so we don't have to define it in the survey Schema
            _user: req.user.id,
            dateSent: Date.now()

       });

       //Great place to send an email
       const mailer = new Mailer(survey, surveyTemplate(survey));
       
       try {
        //async function
        await mailer.send();
        await survey.save();
        req.user.credits -= 1;
        const user = await req.user.save();
        //new value of credits
        res.send(user);
       } catch (err) {
           //422 means something is wrong with data you sent to us
           res.status(422).send(err);
       };

    });
};